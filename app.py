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

    prompt = f"""I am sending you {len(images)} photo(s) of the same 4x4 Rubik's cube taken from different angles.

Your job is to identify ALL 6 faces of the cube by reading the sticker colours across all photos.

The 6 faces are: TOP (U), BOTTOM (D), FRONT (F), BACK (B), LEFT (L), RIGHT (R).

For each face, read the 4x4 grid of 16 stickers left-to-right, top-to-bottom, row by row.
Each sticker is exactly one of these 6 words: white, yellow, red, orange, blue, green.
You MUST use only these exact words. Never use: lime, light green, neon, bright, dark, teal, cyan, crimson, scarlet, or any other variation.
If a sticker looks lime or neon green, call it green. If it looks light yellow or yellow-green, call it yellow. If it looks dark red or crimson, call it red. If it looks dark orange or brown-orange, call it orange.

Important:
- orange and red look similar — be precise
- white and yellow look similar under some lighting — be precise
- Use all photos together to determine every face

Return ONLY this JSON, no markdown, no explanation:
{{
  "U": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "D": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "F": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "B": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "L": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "R": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]
}}

Replace every "c" with the actual colour name. Every array must have exactly 16 values."""

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

            text  = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text  = re.sub(r"```json|```", "", text).strip()
            faces = json.loads(text)

            # Validate
            for face in ["U","D","F","B","L","R"]:
                if face not in faces or len(faces[face]) != 16:
                    raise ValueError(f"Face {face} missing or wrong length")

            return jsonify({"ok": True, "faces": faces})

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
