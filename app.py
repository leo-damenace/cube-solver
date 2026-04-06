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
        "You are reading the sticker colours of a 4x4x4 Rubik's Revenge cube. "
        "Your ONLY job is to read colours and return JSON. Do not solve. Do not explain.\n\n"

        f"You have {num} photos of the same cube:\n"
        "- Photo 1: diagonal corner shot showing the top face and 2 side faces\n"
        "- Photo 2: opposite diagonal corner shot showing the bottom face and the other 2 side faces\n"
        "- Photo 3: straight-on shot of one side face (not top or bottom)\n"
        "- Photo 4: straight-on shot of another side face (not top or bottom)\n\n"

        "Together these 4 photos show all 6 faces. Use ALL photos to determine every sticker.\n\n"

        "The cube has 6 faces. Look at the photos and figure out which colour dominates each face:\n"
        "U = top face, D = bottom face, F = front face, B = back face, L = left face, R = right face\n\n"

        "For each face, read the 4x4 grid of 16 stickers left-to-right, top-to-bottom "
        "as seen when looking directly at that face from outside the cube.\n\n"

        "ONLY use these exact 6 words: white yellow red orange blue green\n"
        "- lime, neon, or bright green = green\n"
        "- cream, ivory, or off-white = white\n"
        "- crimson, dark red, maroon = red\n"
        "- amber, rust, or brown-orange = orange\n"
        "- gold or light yellow = yellow\n"
        "- navy, teal, or dark blue = blue\n\n"

        "Before returning, verify: each colour appears exactly 16 times across all 6 faces (96 total).\n"
        "Also return the orientation you determined: which colour is on which face.\n\n"

        "Return ONLY this JSON — no markdown, no explanation, nothing else:\n"
        '{"orientation":{"U":"colour","D":"colour","F":"colour","B":"colour","L":"colour","R":"colour"},'
        '"U":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],'
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

            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"```json|```", "", text).strip()
            parsed = json.loads(text)

            orientation = parsed.get("orientation", {})
            faces = {k: parsed[k] for k in ["U","R","F","D","L","B"]}

            allowed = {"white","yellow","red","orange","blue","green"}
            for face in ["U","R","F","D","L","B"]:
                if face not in faces or len(faces[face]) != 16:
                    raise ValueError(f"Face {face} missing or wrong length")
                faces[face] = [c.lower().strip() for c in faces[face]]
                for c in faces[face]:
                    if c not in allowed:
                        raise ValueError(f"Unknown colour '{c}' on face {face}")

            counts = {}
            for face in ["U","R","F","D","L","B"]:
                for c in faces[face]:
                    counts[c] = counts.get(c, 0) + 1
            wrong = {c: n for c, n in counts.items() if n != 16}
            if wrong:
                raise ValueError(f"Colour counts wrong: {wrong}")

            return jsonify({"ok": True, "faces": faces, "orientation": orientation})

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
