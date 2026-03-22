from flask import Flask, render_template, request, jsonify
import os, json, re, time, random
import urllib.request, urllib.error

app = Flask(__name__)

VALID_CODES = ["CUBE-4829","CUBE-1147","CUBE-3301","CUBE-7755","CUBE-0042"]

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY
)

_last_request_time = 0
_MIN_GAP = 4.0
 
SHOT_FACES = {
    1: ["U", "F", "R"],
    2: ["D", "B", "L"],
}

FACE_PROMPTS = {
    1: (
        "You are a Rubik's cube color scanner. Analyze this photo of a 4x4 Rubik's cube.\n"
        "The cube is held at a CORNER angle so THREE faces are visible:\n"
        "  - U (Top face): the face pointing upward\n"
        "  - F (Front face): the face pointing toward the camera\n"
        "  - R (Right face): the face on the right side\n\n"
        "For each face, read ALL 16 stickers in a 4x4 grid, left-to-right, top-to-bottom.\n\n"
        "COLOR GUIDE — be very precise:\n"
        "  white  = clearly white or very light cream\n"
        "  yellow = bright yellow\n"
        "  red    = red or dark red (NOT orange)\n"
        "  orange = orange (warmer than red, NOT yellow)\n"
        "  blue   = any shade of blue\n"
        "  green  = any shade of green\n\n"
        "RULES:\n"
        "  - Every sticker MUST be exactly one of: white, yellow, red, orange, blue, green\n"
        "  - Never output: grey, gray, purple, pink, brown, or anything else\n"
        "  - Each face must have EXACTLY 16 values\n"
        "  - A solved face has one dominant color — use that as a sanity check\n\n"
        "Return ONLY this JSON, no markdown, no explanation:\n"
        '{"U":["","","","","","","","","","","","","","","",""],'
        '"F":["","","","","","","","","","","","","","","",""],'
        '"R":["","","","","","","","","","","","","","","",""]}'
    ),
    2: (
        "You are a Rubik's cube color scanner. Analyze this photo of a 4x4 Rubik's cube.\n"
        "The cube has been flipped to show the OPPOSITE corner — THREE faces are visible:\n"
        "  - D (Bottom face): was the bottom, now facing upward toward camera\n"
        "  - B (Back face): the far face visible behind\n"
        "  - L (Left face): the face on the left side\n\n"
        "For each face, read ALL 16 stickers in a 4x4 grid, left-to-right, top-to-bottom,\n"
        "oriented as if looking directly at each face straight-on.\n\n"
        "COLOR GUIDE — be very precise:\n"
        "  white  = clearly white or very light cream\n"
        "  yellow = bright yellow\n"
        "  red    = red or dark red (NOT orange)\n"
        "  orange = orange (warmer than red, NOT yellow)\n"
        "  blue   = any shade of blue\n"
        "  green  = any shade of green\n\n"
        "RULES:\n"
        "  - Every sticker MUST be exactly one of: white, yellow, red, orange, blue, green\n"
        "  - Never output: grey, gray, purple, pink, brown, or anything else\n"
        "  - Each face must have EXACTLY 16 values\n"
        "  - A solved face has one dominant color — use that as a sanity check\n\n"
        "Return ONLY this JSON, no markdown, no explanation:\n"
        '{"D":["","","","","","","","","","","","","","","",""],'
        '"B":["","","","","","","","","","","","","","","",""],'
        '"L":["","","","","","","","","","","","","","","",""]}'
    ),
}

VALID_COLORS = {"white","yellow","red","orange","blue","green"}


def call_gemini(image_b64: str, shot: int) -> dict:
    global _last_request_time

    elapsed = time.time() - _last_request_time
    if elapsed < _MIN_GAP:
        time.sleep(_MIN_GAP - elapsed + random.uniform(0.2, 0.8))

    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": FACE_PROMPTS[shot]},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
            ]
        }],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 512
        }
    }).encode()

    wait = 5
    for attempt in range(5):
        try:
            _last_request_time = time.time()
            req = urllib.request.Request(
                GEMINI_URL, data=payload,
                headers={"Content-Type": "application/json"}, method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read())

            raw = body["candidates"][0]["content"]["parts"][0]["text"].strip()
            raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\n?```$", "", raw)
            return json.loads(raw)

        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                time.sleep(wait + random.uniform(1, 3))
                wait *= 2
                continue
            try:
                msg = json.loads(e.read()).get("error", {}).get("message", str(e))
            except Exception:
                msg = str(e)
            raise RuntimeError(f"Gemini API error {e.code}: {msg}")
        except Exception as ex:
            raise RuntimeError(str(ex))


def validate_face(colors: list) -> list:
    out = []
    for c in (colors or []):
        c = str(c).lower().strip()
        out.append(c if c in VALID_COLORS else "white")
    while len(out) < 16:
        out.append("white")
    return out[:16]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    code = data.get("code", "").strip().upper()
    return jsonify({"valid": code in VALID_CODES})


@app.route("/analyze-shot", methods=["POST"])
def analyze_shot():
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY not set on server"}), 500

    data  = request.get_json()
    shot  = int(data.get("shot", 1))
    image = data.get("image", "")

    if shot not in (1, 2):
        return jsonify({"error": "shot must be 1 or 2"}), 400
    if not image:
        return jsonify({"error": "no image provided"}), 400

    try:
        result = call_gemini(image, shot)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    output = {}
    for face_key in SHOT_FACES[shot]:
        output[face_key] = validate_face(result.get(face_key, []))

    return jsonify(output)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)from flask import Flask, render_template, request, jsonify
import os, json, re, time, random
import urllib.request, urllib.error

app = Flask(__name__)

VALID_CODES = ["CUBE-4829","CUBE-1147","CUBE-3301","CUBE-7755","CUBE-0042"]

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY
)

_last_request_time = 0
_MIN_GAP = 4.0

SHOT_FACES = {
    1: ["U", "F", "R"],
    2: ["D", "B", "L"],
}

FACE_PROMPTS = {
    1: (
        "You are a Rubik's cube color scanner. Analyze this photo of a 4x4 Rubik's cube.\n"
        "The cube is held at a CORNER angle so THREE faces are visible:\n"
        "  - U (Top face): the face pointing upward\n"
        "  - F (Front face): the face pointing toward the camera\n"
        "  - R (Right face): the face on the right side\n\n"
        "For each face, read ALL 16 stickers in a 4x4 grid, left-to-right, top-to-bottom.\n\n"
        "COLOR GUIDE — be very precise:\n"
        "  white  = clearly white or very light cream\n"
        "  yellow = bright yellow\n"
        "  red    = red or dark red (NOT orange)\n"
        "  orange = orange (warmer than red, NOT yellow)\n"
        "  blue   = any shade of blue\n"
        "  green  = any shade of green\n\n"
        "RULES:\n"
        "  - Every sticker MUST be exactly one of: white, yellow, red, orange, blue, green\n"
        "  - Never output: grey, gray, purple, pink, brown, or anything else\n"
        "  - Each face must have EXACTLY 16 values\n"
        "  - A solved face has one dominant color — use that as a sanity check\n\n"
        "Return ONLY this JSON, no markdown, no explanation:\n"
        '{"U":["","","","","","","","","","","","","","","",""],'
        '"F":["","","","","","","","","","","","","","","",""],'
        '"R":["","","","","","","","","","","","","","","",""]}'
    ),
    2: (
        "You are a Rubik's cube color scanner. Analyze this photo of a 4x4 Rubik's cube.\n"
        "The cube has been flipped to show the OPPOSITE corner — THREE faces are visible:\n"
        "  - D (Bottom face): was the bottom, now facing upward toward camera\n"
        "  - B (Back face): the far face visible behind\n"
        "  - L (Left face): the face on the left side\n\n"
        "For each face, read ALL 16 stickers in a 4x4 grid, left-to-right, top-to-bottom,\n"
        "oriented as if looking directly at each face straight-on.\n\n"
        "COLOR GUIDE — be very precise:\n"
        "  white  = clearly white or very light cream\n"
        "  yellow = bright yellow\n"
        "  red    = red or dark red (NOT orange)\n"
        "  orange = orange (warmer than red, NOT yellow)\n"
        "  blue   = any shade of blue\n"
        "  green  = any shade of green\n\n"
        "RULES:\n"
        "  - Every sticker MUST be exactly one of: white, yellow, red, orange, blue, green\n"
        "  - Never output: grey, gray, purple, pink, brown, or anything else\n"
        "  - Each face must have EXACTLY 16 values\n"
        "  - A solved face has one dominant color — use that as a sanity check\n\n"
        "Return ONLY this JSON, no markdown, no explanation:\n"
        '{"D":["","","","","","","","","","","","","","","",""],'
        '"B":["","","","","","","","","","","","","","","",""],'
        '"L":["","","","","","","","","","","","","","","",""]}'
    ),
}

VALID_COLORS = {"white","yellow","red","orange","blue","green"}


def call_gemini(image_b64: str, shot: int) -> dict:
    global _last_request_time

    elapsed = time.time() - _last_request_time
    if elapsed < _MIN_GAP:
        time.sleep(_MIN_GAP - elapsed + random.uniform(0.2, 0.8))

    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": FACE_PROMPTS[shot]},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
            ]
        }],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 512
        }
    }).encode()

    wait = 5
    for attempt in range(5):
        try:
            _last_request_time = time.time()
            req = urllib.request.Request(
                GEMINI_URL, data=payload,
                headers={"Content-Type": "application/json"}, method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read())

            raw = body["candidates"][0]["content"]["parts"][0]["text"].strip()
            raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\n?```$", "", raw)
            return json.loads(raw)

        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                time.sleep(wait + random.uniform(1, 3))
                wait *= 2
                continue
            try:
                msg = json.loads(e.read()).get("error", {}).get("message", str(e))
            except Exception:
                msg = str(e)
            raise RuntimeError(f"Gemini API error {e.code}: {msg}")
        except Exception as ex:
            raise RuntimeError(str(ex))


def validate_face(colors: list) -> list:
    out = []
    for c in (colors or []):
        c = str(c).lower().strip()
        out.append(c if c in VALID_COLORS else "white")
    while len(out) < 16:
        out.append("white")
    return out[:16]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    code = data.get("code", "").strip().upper()
    return jsonify({"valid": code in VALID_CODES})


@app.route("/analyze-shot", methods=["POST"])
def analyze_shot():
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY not set on server"}), 500

    data  = request.get_json()
    shot  = int(data.get("shot", 1))
    image = data.get("image", "")

    if shot not in (1, 2):
        return jsonify({"error": "shot must be 1 or 2"}), 400
    if not image:
        return jsonify({"error": "no image provided"}), 400

    try:
        result = call_gemini(image, shot)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    output = {}
    for face_key in SHOT_FACES[shot]:
        output[face_key] = validate_face(result.get(face_key, []))

    return jsonify(output)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
