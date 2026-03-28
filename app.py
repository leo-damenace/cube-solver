from flask import Flask, render_template, request, jsonify
import os, json, re, time
import urllib.request
from collections import defaultdict

app = Flask(__name__, static_folder='static', static_url_path='/static')

GEMINI_FLASH_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

# ── RATE LIMITING ─────────────────────────────────────────
request_log = defaultdict(list)

def is_rate_limited(ip):
    now = time.time()
    request_log[ip] = [t for t in request_log[ip] if now - t < 60]
    if len(request_log[ip]) >= 8:
        return True
    request_log[ip].append(now)
    return False

def gemini_post(api_key, payload_dict, timeout=120):
    payload = json.dumps(payload_dict).encode("utf-8")
    req = urllib.request.Request(
        f"{GEMINI_FLASH_URL}?key={api_key}",
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "CubeSolveApp/1.0"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

# ── ROUTES ────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html",
        supabase_url=os.environ.get("SUPABASE_URL", ""),
        supabase_anon_key=os.environ.get("SUPABASE_ANON_KEY", "")
    )

@app.route("/analyze", methods=["POST"])
def analyze():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr).split(",")[0].strip()
    if is_rate_limited(ip):
        return jsonify({"ok": False, "error": "Too many requests. Please wait a moment."}), 429

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"ok": False, "error": "Server misconfigured — GEMINI_API_KEY missing."}), 500

    data   = request.get_json()
    images = data.get("images", [])
    if not images:
        return jsonify({"ok": False, "error": "No images received."}), 400

    # ── STEP 1: Read colours from photos ──────────────────
    colour_prompt = """You are reading the sticker colours of a scrambled 4x4 Rubik's cube from photos.

Look at all the photos carefully. Identify all 6 faces: U (top), D (bottom), F (front), B (back), L (left), R (right).

For each face, read the 4x4 grid of 16 stickers left-to-right, top-to-bottom.
Each sticker must be exactly one of: white, yellow, red, orange, blue, green

Return ONLY this JSON, no markdown, no explanation:
{
  "U": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "D": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "F": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "B": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "L": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "R": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]
}
Each array must have exactly 16 values. Use only: white, yellow, red, orange, blue, green."""

    parts = [{"text": colour_prompt}]
    for img_b64 in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": img_b64}})

    faces = None
    last_error = ""
    for attempt in range(3):
        try:
            result = gemini_post(api_key, {
                "contents": [{"parts": parts}],
                "generationConfig": {"temperature": 0, "maxOutputTokens": 4096}
            })

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")})

            text  = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text  = re.sub(r"```json|```", "", text).strip()
            faces = json.loads(text)

            valid_colours = {"white","yellow","red","orange","blue","green"}
            for face in ["U","D","F","B","L","R"]:
                if face not in faces or len(faces[face]) != 16:
                    raise ValueError(f"Face {face} missing or wrong length")
                for c in faces[face]:
                    if c.lower().strip() not in valid_colours:
                        raise ValueError(f"Invalid colour '{c}' in face {face}")

            break

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            last_error = str(e)
            time.sleep(2)
            continue
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code}"
            if e.code in [429, 500, 503]:
                time.sleep(2 ** (attempt + 1))
                continue
            return jsonify({"ok": False, "error": f"Gemini API error {e.code}"}), 500
        except Exception as e:
            last_error = str(e)
            time.sleep(2)
            continue

    if faces is None:
        return jsonify({"ok": False, "error": f"Could not read cube colours: {last_error}"})

    # ── STEP 2: Solve using Gemini with high thinking budget ──
    # Build a clean colour description for the solver
    face_desc = ""
    for face, label in [("U","TOP"),("D","BOTTOM"),("F","FRONT"),("B","BACK"),("L","LEFT"),("R","RIGHT")]:
        stickers = faces[face]
        rows = []
        for row in range(4):
            rows.append(" | ".join(stickers[row*4:(row+1)*4]))
        face_desc += f"\n{label} face ({face}):\n" + "\n".join(rows) + "\n"

    solve_prompt = f"""You are an expert 4x4 Rubik's cube solver with deep knowledge of the reduction method (centres → edges → 3x3 stage) and OLL/PLL parity algorithms.

Here is the current state of a scrambled 4x4 cube. Each face shows 4 rows of 4 stickers:
{face_desc}

Important note: This is a 4x4 cube — there are NO fixed centres. The colour scheme must be inferred from the overall state of the cube.

Your task: Produce a complete, correct solution — a sequence of moves that when applied to this cube state will result in a fully solved cube.

Use standard 4x4 notation:
- Outer faces: U, D, F, B, L, R (and ', 2 variants)
- Wide moves (2 layers): Uw, Dw, Fw, Bw, Lw, Rw (and ', 2 variants)  
- Inner slices: u, d, f, b, l, r (lowercase, and ', 2 variants)

Think through this carefully and systematically:
1. First identify what colour each face centre group should be
2. Solve the centres
3. Pair up the edges
4. Solve as a 3x3, handling any parity cases

Return ONLY this JSON when done, no markdown, no explanation:
{{"solution": "move1 move2 move3 ..."}}"""

    for attempt in range(3):
        try:
            result = gemini_post(api_key, {
                "contents": [{"parts": [{"text": solve_prompt}]}],
                "generationConfig": {
                    "temperature": 0,
                    "maxOutputTokens": 8192,
                    "thinkingConfig": {
                        "thinkingBudget": 8192
                    }
                }
            }, timeout=180)

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini solver error")})

            # Extract text from response — skip any thinking parts
            text = ""
            for part in result["candidates"][0]["content"]["parts"]:
                if not part.get("thought", False):
                    text += part.get("text", "")
            text = text.strip()
            text = re.sub(r"```json|```", "", text).strip()

            parsed   = json.loads(text)
            solution = parsed.get("solution", "").strip()
            if not solution:
                raise ValueError("Empty solution")

            moves = solution.split()
            if len(moves) < 1:
                raise ValueError("No moves in solution")

            return jsonify({
                "ok": True,
                "solution":    solution,
                "move_count":  len(moves),
                "faces":       faces  # send back so frontend can show colours if needed
            })

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            last_error = str(e)
            time.sleep(2)
            continue
        except urllib.error.HTTPError as e:
            last_error = f"HTTP {e.code}"
            if e.code in [429, 500, 503]:
                time.sleep(2 ** (attempt + 1))
                continue
            return jsonify({"ok": False, "error": f"Gemini API error {e.code}"}), 500
        except Exception as e:
            last_error = str(e)
            time.sleep(2)
            continue

    return jsonify({"ok": False, "error": f"Could not generate solution: {last_error}"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
