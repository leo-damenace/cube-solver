from flask import Flask, render_template, request, jsonify
import os, json, re, time
import urllib.request
from collections import defaultdict

app = Flask(__name__, static_folder='static', static_url_path='/static')

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

VALID_COLOURS = {"white", "yellow", "red", "orange", "blue", "green"}

# ── RATE LIMITING ───────────────────────────────────────── 
request_log = defaultdict(list)

def is_rate_limited(ip):
    now = time.time()
    request_log[ip] = [t for t in request_log[ip] if now - t < 60]
    if len(request_log[ip]) >= 8:
        return True
    request_log[ip].append(now)
    return False

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

    if not images or len(images) < 1:
        return jsonify({"ok": False, "error": "No images received."}), 400

    prompt = f"""You are a Rubik's cube colour reader. I am sending you {len(images)} photo(s) of the same 4x4 Rubik's cube from different angles.

Identify ALL 6 faces: TOP (U), BOTTOM (D), FRONT (F), BACK (B), LEFT (L), RIGHT (R).

For each face, read the 4x4 grid of 16 stickers left-to-right, top-to-bottom.

STRICT RULES — violation will break the solver:
1. Each sticker colour MUST be exactly one of these 6 words: white, yellow, red, orange, blue, green
2. Do NOT use any other word. Not "lime", "cream", "gold", "scarlet", "teal", "cyan", "dark red", "light blue", or anything else.
3. Every array MUST have EXACTLY 16 values — no more, no less.
4. All 6 faces MUST be present: U, D, F, B, L, R.
5. Across all 6 faces combined (96 stickers total), each of the 6 colours should appear approximately 16 times.

Colour disambiguation guide:
- orange vs red: orange is warm/bright like a fruit, red is darker and more saturated
- white vs yellow: white is neutral/bright, yellow has a clear warm tint
- blue vs green: blue is cool/sky-like, green has yellow-green tint

Return ONLY this JSON structure, no markdown fences, no explanation, no preamble:
{{
  "U": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "D": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "F": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "B": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "L": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "R": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]
}}

Replace every "c" with the actual colour. Each array must have exactly 16 values."""

    parts = [{"text": prompt}]
    for img_b64 in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": img_b64}})

    payload = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 4096  # ← was 1024, caused truncation
        }
    }).encode("utf-8")

    last_error = ""
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                f"{GEMINI_URL}?key={api_key}",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "CubeSolveApp/1.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")})

            text  = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text  = re.sub(r"```json|```", "", text).strip()
            faces = json.loads(text)

            # ── Structural validation ──────────────────────────
            for face in ["U", "D", "F", "B", "L", "R"]:
                if face not in faces:
                    raise ValueError(f"Face {face} missing from Gemini response")
                if len(faces[face]) != 16:
                    raise ValueError(f"Face {face} has {len(faces[face])} stickers (expected 16)")

            # ── Colour name validation ─────────────────────────
            bad_colours = {}
            for face, stickers in faces.items():
                bad = [c for c in stickers if c.lower().strip() not in VALID_COLOURS]
                if bad:
                    bad_colours[face] = list(set(bad))

            if bad_colours:
                raise ValueError(f"Invalid colour names returned: {bad_colours}. Retrying...")

            # ── Count validation (soft warning, don't retry) ───
            colour_counts = defaultdict(int)
            for face in faces.values():
                for c in face:
                    colour_counts[c.lower().strip()] += 1

            counts_ok = all(colour_counts.get(c, 0) == 16 for c in VALID_COLOURS)
            total_ok  = sum(colour_counts.values()) == 96

            return jsonify({
                "ok": True,
                "faces": faces,
                "colour_counts": dict(colour_counts),
                "counts_valid": counts_ok and total_ok
            })

        except urllib.error.HTTPError as e:
            body = e.read().decode()
            last_error = f"HTTP {e.code}"
            if e.code in [429, 500, 503]:
                time.sleep(2 ** (attempt + 1))
                continue
            return jsonify({"ok": False, "error": f"Gemini API error {e.code}: {body[:200]}"})

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            last_error = str(e)
            time.sleep(2)
            continue

        except Exception as e:
            last_error = str(e)
            time.sleep(2)
            continue

    return jsonify({"ok": False, "error": f"Failed after retries: {last_error}"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
