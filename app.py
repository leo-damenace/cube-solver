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
_MIN_GAP = 3.0

# One face at a time — dead simple prompt
FACE_PROMPT = (
    "This is a photo of ONE face of a 4x4 Rubik's cube held flat toward the camera.\n"
    "Read the 16 stickers in a 4x4 grid, left-to-right, top-to-bottom (like reading text).\n"
    "Each sticker is exactly one of: white, yellow, red, orange, blue, green\n"
    "Do NOT use any other colour names.\n\n"
    "Return ONLY a JSON array of exactly 16 colour strings, nothing else:\n"
    '["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]'
)

VALID_COLORS = {"white","yellow","red","orange","blue","green"}

def call_gemini(image_b64: str) -> list:
    global _last_request_time

    elapsed = time.time() - _last_request_time
    if elapsed < _MIN_GAP:
        time.sleep(_MIN_GAP - elapsed + random.uniform(0.1, 0.5))

    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": FACE_PROMPT},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
            ]
        }],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 200}
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
            result = json.loads(raw)
            if not isinstance(result, list):
                raise ValueError("Expected a list")
            return result

        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                time.sleep(wait + random.uniform(1, 3))
                wait *= 2
                continue
            try:
                msg = json.loads(e.read()).get("error", {}).get("message", str(e))
            except Exception:
                msg = str(e)
            raise RuntimeError(f"Gemini error {e.code}: {msg}")
        except Exception as ex:
            raise RuntimeError(str(ex))

def validate(colors):
    out = []
    for c in (colors or []):
        c = str(c).lower().strip()
        out.append(c if c in VALID_COLORS else "white")
    while len(out) < 16: out.append("white")
    return out[:16]

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    code = data.get("code","").strip().upper()
    return jsonify({"valid": code in VALID_CODES})

@app.route("/analyze-face", methods=["POST"])
def analyze_face():
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY not set"}), 500
    data  = request.get_json()
    image = data.get("image", "")
    if not image:
        return jsonify({"error": "no image"}), 400
    try:
        result = call_gemini(image)
        return jsonify({"colors": validate(result)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
