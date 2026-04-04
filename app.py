from flask import Flask, render_template, request, jsonify
import os, json, re, time
import urllib.request
from collections import defaultdict

app = Flask(__name__, static_folder='static', static_url_path='/static')

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

request_log = defaultdict(list)

def is_rate_limited(ip):
    now = time.time()
    request_log[ip] = [t for t in request_log[ip] if now - t < 60]
    if len(request_log[ip]) >= 8:
        return True
    request_log[ip].append(now)
    return False

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
        return jsonify({"ok": False, "error": "GEMINI_API_KEY missing"}), 500

    data   = request.get_json()
    images = data.get("images", [])
    if not images:
        return jsonify({"ok": False, "error": "No images received"}), 400

    num = len(images)
    prompt = (
        "You are a colour-reading machine for a 4x4x4 Rubik's Revenge cube. "
        "Your ONLY job is to read the colour of every sticker and return JSON. Nothing else.\n\n"

        f"I am giving you {num} photos of the SAME 4x4x4 cube from different angles. "
        "Use ALL photos together to determine every sticker.\n\n"

        "The cube has 6 faces: U (top), D (bottom), F (front), B (back), L (left), R (right). "
        "Each face has exactly 16 stickers in a 4x4 grid. "
        "Read each face left-to-right, top-to-bottom, row by row.\n\n"

        "The cube uses exactly these 6 colours and no others:\n"
        "  white, yellow, red, orange, blue, green\n\n"

        "STRICT COLOUR RULES — you must follow these exactly:\n"
        "- If a sticker looks lime, neon green, or yellow-green: call it GREEN\n"
        "- If a sticker looks cream, off-white, or light: call it WHITE\n"
        "- If a sticker looks dark red, crimson, or maroon: call it RED\n"
        "- If a sticker looks amber, dark orange, or brown-orange: call it ORANGE\n"
        "- If a sticker looks light yellow or gold: call it YELLOW\n"
        "- If a sticker looks teal, navy, or dark blue: call it BLUE\n"
        "- NEVER use any word other than: white yellow red orange blue green\n\n"

        "VALIDATION — before returning, check:\n"
        "- Every array has exactly 16 values\n"
        "- Across all 6 faces, each colour appears exactly 16 times (total 96 stickers)\n"
        "- Only the 6 allowed colour words are used\n"
        "- If your counts are wrong, re-examine the photos and correct them\n\n"

        "Return ONLY this JSON with no markdown, no explanation, no extra text:\n"
        '{"U":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],'
        '"R":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],'
        '"F":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],'
        '"D":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],'
        '"L":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],'
        '"B":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]}'
    )

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
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")})

            text  = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text  = re.sub(r"```json|```", "", text).strip()
            faces = json.loads(text)

            # Validate all 6 faces present with 16 stickers each
            for face in ["U","R","F","D","L","B"]:
                if face not in faces or len(faces[face]) != 16:
                    raise ValueError(f"Face {face} missing or wrong length")

            # Normalise colours
            allowed = {"white","yellow","red","orange","blue","green"}
            for face in ["U","R","F","D","L","B"]:
                faces[face] = [c.lower().strip() for c in faces[face]]
                for c in faces[face]:
                    if c not in allowed:
                        raise ValueError(f"Unknown colour '{c}' on face {face}")

            # Validate counts
            counts = {}
            for face in ["U","R","F","D","L","B"]:
                for c in faces[face]:
                    counts[c] = counts.get(c, 0) + 1
            wrong = {c: n for c, n in counts.items() if n != 16}
            if wrong:
                raise ValueError(f"Colour counts wrong: {wrong}")

            return jsonify({"ok": True, "faces": faces, "raw": text})

        except (json.JSONDecodeError, ValueError) as e:
            last_error = str(e)
            time.sleep(2)
            continue
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            last_error = f"HTTP {e.code}"
            if e.code in [429, 500, 503]:
                time.sleep(2 ** (attempt + 1))
                continue
            return jsonify({"ok": False, "error": f"Gemini API error {e.code}: {body[:200]}"})
        except Exception as e:
            last_error = str(e)
            time.sleep(2)
            continue

    return jsonify({"ok": False, "error": f"Failed after retries: {last_error}"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
