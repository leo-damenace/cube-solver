from flask import Flask, render_template, request, jsonify
import os, json, re, time
import urllib.request
from collections import defaultdict

app = Flask(__name__, static_folder='static', static_url_path='/static')

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

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
    images = data.get("images", [])  # list of up to 4 base64 strings

    if not images or len(images) < 1:
        return jsonify({"ok": False, "error": "No images received."}), 400

    prompt = f"""You are a 4x4 Rubik's cube expert solver. I am sending you {len(images)} photos of the same SCRAMBLED 4x4 Rubik's cube from different angles.

IMPORTANT: This is a 4x4x4 cube, NOT a 3x3x3. It has 16 stickers per face (4 rows of 4), not 9.

Your job:
1. Study all photos carefully to understand the current state of every face
2. Solve the cube completely using standard 4x4 notation
3. Return the full solution as a sequence of moves

4x4 move notation you must use:
- Face moves: U, D, F, B, L, R (and their inverses with ' and double with 2)
- Wide moves (2 layers): Uw, Dw, Fw, Bw, Lw, Rw (and inverses/doubles)
- These are the ONLY valid moves. Do not use x, y, z rotations or Uu, Dd etc.

A real scrambled 4x4 cube typically requires 40-80 moves to solve. If your solution is fewer than 20 moves, you have made an error — look more carefully at the photos.

Do NOT include:
- Orientation instructions (do not say "hold white on top")
- Any text before or after the moves
- Brackets, parentheses, or move groups
- Any explanation

Return ONLY the moves separated by spaces, exactly like this example:
R U R' F2 Lw U2 Rw' D Fw2 Uw Rw U Lw' D2 Fw Uw2 Rw2 U Rw D2 Lw2"""

    parts = [{"text": prompt}]
    for img_b64 in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": img_b64}})

    payload = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 1024}
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

            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"```.*?```", "", text, flags=re.DOTALL).strip()
            # Clean up — keep only valid move characters
            moves = re.findall(r"[UDFBLRMESudwfblr][w]?[2']?", text)
            if len(moves) < 5:
                raise ValueError("Too few moves returned — Gemini may not have solved correctly")
            solution = " ".join(moves)
            return jsonify({"ok": True, "solution": solution})

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
