from flask import Flask, render_template, request, jsonify
import os, json, re, time, random
import urllib.request, urllib.error

app = Flask(__name__)

VALID_CODES = [
    "CUBE-4829",
    "CUBE-1147",
    "CUBE-3301",
    "CUBE-7755",
    "CUBE-0042",
]

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY
)

# ── Rate limiting: track last request time globally ───────
_last_request_time = 0
_MIN_GAP = 4.0   # minimum seconds between Gemini calls

SHOT_FACES = {
    1: ["U", "F", "R"],
    2: ["D", "B", "L"],
}

FACE_PROMPTS = {
    1: (
        "This is a photo of a 4x4 Rubik's cube taken from the TOP-FRONT-RIGHT corner. "
        "Three faces are visible: TOP (facing up), FRONT (facing you), RIGHT (facing right). "
        "For each face, read the 4x4 grid of sticker colours left-to-right, top-to-bottom. "
        "Return ONLY valid JSON, no markdown, no explanation:\n"
        "{\n"
        '  "U": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],\n'
        '  "F": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],\n'
        '  "R": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]\n'
        "}\n"
        "Each colour must be exactly one of: white, yellow, red, orange, blue, green"
    ),
    2: (
        "This is a photo of a 4x4 Rubik's cube taken from the BOTTOM-BACK-LEFT corner. "
        "Three faces are visible: BOTTOM (facing down / toward you), BACK (far face), LEFT (facing left). "
        "For each face, read the 4x4 grid of sticker colours left-to-right, top-to-bottom "
        "(orient each face as if looking directly at it). "
        "Return ONLY valid JSON, no markdown, no explanation:\n"
        "{\n"
        '  "D": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],\n'
        '  "B": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],\n'
        '  "L": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]\n'
        "}\n"
        "Each colour must be exactly one of: white, yellow, red, orange, blue, green"
    ),
}

VALID_COLORS = {"white", "yellow", "red", "orange", "blue", "green"}


def call_gemini(image_b64: str, shot: int) -> dict:
    global _last_request_time

    # Enforce minimum gap between requests to avoid 429s
    elapsed = time.time() - _last_request_time
    if elapsed < _MIN_GAP:
        time.sleep(_MIN_GAP - elapsed + random.uniform(0.2, 0.8))

    prompt  = FACE_PROMPTS[shot]
    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
            ]
        }],
        "generationConfig": {"temperature": 0.1}
    }).encode()

    wait = 5   # start with 5s backoff on 429
    for attempt in range(5):
        try:
            _last_request_time = time.time()
            req = urllib.request.Request(
                GEMINI_URL,
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read())

            raw = body["candidates"][0]["content"]["parts"][0]["text"].strip()
            raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\n?```$", "", raw)
            return json.loads(raw)

        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                jitter = random.uniform(1, 3)
                time.sleep(wait + jitter)
                wait *= 2   # 5 → 10 → 20 → 40s
                continue
            # Read error body for better message
            try:
                err_body = json.loads(e.read())
                msg = err_body.get("error", {}).get("message", str(e))
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
    if code in VALID_CODES:
        return jsonify({"valid": True})
    return jsonify({"valid": False})


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
