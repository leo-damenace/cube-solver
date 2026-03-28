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
    images = data.get("images", [])

    if not images:
        return jsonify({"ok": False, "error": "No images received."}), 400

    prompt = """You are an expert Rubik's cube solver. I am sending you photos of a scrambled 4x4 Rubik's cube taken from different angles.

Analyse all the photos carefully to understand the full state of the cube, then produce a solution — a sequence of moves that will solve it from its current scrambled state.

Use standard 4x4 cube notation:
- Face moves: U, D, F, B, L, R (and their inverses with ' and doubles with 2)
- Wide moves: Uw, Dw, Fw, Bw, Lw, Rw (and inverses/doubles)
- Inner slice moves: u, d, f, b, l, r (lowercase, and inverses/doubles)

Return ONLY this JSON, no markdown, no explanation:
{
  "solution": "move1 move2 move3 ..."
}

The solution value must be a space-separated sequence of valid 4x4 notation moves that solves the cube. Do not include anything else."""

    parts = [{"text": prompt}]
    for img_b64 in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": img_b64}})

    payload = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 4096}
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
            with urllib.request.urlopen(req, timeout=90) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")})

            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"```json|```", "", text).strip()
            parsed = json.loads(text)

            solution = parsed.get("solution", "").strip()
            if not solution:
                raise ValueError("Empty solution returned")

            # Basic sanity check — must contain at least one valid-looking move
            moves = solution.split()
            if len(moves) < 1:
                raise ValueError("No moves in solution")

            return jsonify({"ok": True, "solution": solution, "move_count": len(moves)})

        except urllib.error.HTTPError as e:
            body = e.read().decode()
            last_error = f"HTTP {e.code}"
            if e.code in [429, 500, 503]:
                time.sleep(2 ** (attempt + 1))
                continue
            return jsonify({"ok": False, "error": f"Gemini API error {e.code}: {body[:200]}"}), 500

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
