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
        "This is NOT a 3x3. Each face is a 4x4 grid of 16 stickers. There are no fixed centres.\n\n"

        f"You have {num} photos. Here is exactly what each photo shows:\n"
        "- Photo 1: The cube shot from one corner at a 45-degree angle. "
        "You can see 3 faces: the top face, and the 2 side faces on that corner.\n"
        "- Photo 2: The cube shot from the OPPOSITE corner at a 45-degree angle. "
        "You can see the other 3 faces: the bottom face, and the 2 remaining side faces.\n"
        "- Photo 3: A straight-on shot of one of the 4 side faces (not the top, not the bottom).\n"
        "- Photo 4: A straight-on shot of another side face (not the top, not the bottom).\n\n"

        "Together these 4 photos show all 6 faces of the cube. "
        "Use all photos to reconstruct the exact state of every sticker.\n\n"

        "IMPORTANT — you must figure out the orientation yourself from the photos. "
        "Look at which colour dominates each face and identify U (top), D (bottom), F (front), B (back), L (left), R (right) "
        "based on what you actually see. Do not assume any fixed colour-to-face mapping.\n\n"

        "Once you have identified the orientation, return two things:\n\n"
        "1. The orientation mapping — which colour is on which face:\n"
        '{"orientation": {"U": "colour", "D": "colour", "F": "colour", "B": "colour", "L": "colour", "R": "colour"}}\n\n'
        "2. The 6 face arrays — each face read left-to-right, top-to-bottom from the perspective "
        "of someone looking directly at that face from outside the cube:\n"
        '{"U": [16 colours], "R": [16 colours], "F": [16 colours], "D": [16 colours], "L": [16 colours], "B": [16 colours]}\n\n'

        "Only use these 6 colour words: white yellow red orange blue green\n"
        "- lime or neon green = green\n"
        "- cream or off-white = white\n"
        "- crimson or dark red = red\n"
        "- amber or dark orange = orange\n\n"

        "Validate before returning: each colour must appear exactly 16 times across all 6 faces.\n\n"

        "Return ONLY this JSON, no markdown, no explanation:\n"
        '{"orientation":{"U":"?","D":"?","F":"?","B":"?","L":"?","R":"?"},'
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

            text  = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text  = re.sub(r"```json|```", "", text).strip()
            data_out = json.loads(text)

            # Extract orientation and faces
            orientation = data_out.get("orientation", {})
            faces = {k: data_out[k] for k in ["U","R","F","D","L","B"]}

            # Validate all 6 faces present with 16 stickers each
            for face in ["U","R","F","D","L","B"]:
                if face not in faces or len(faces[face]) != 16:
                    raise ValueError(f"Face {face} missing or wrong length")

            # Normalise and validate colours
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
