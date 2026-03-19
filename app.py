from flask import Flask, render_template, request, jsonify
import os, json, re
import urllib.request

app = Flask(__name__, static_folder='static', static_url_path='/static')

VALID_CODES = [
    "CUBE-4829", "CUBE-1147", "CUBE-3301", "CUBE-7755", "CUBE-0042",
]

# Use a stable model name
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    code = data.get("code", "").strip().upper()
    return jsonify({"valid": code in VALID_CODES})

@app.route("/ask-gemini")
def ask_gemini():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"error": "no key"})
    
    question = """I am building a web app that photographs a 4x4 Rubik's cube and sends the image to you (Gemini 2.5 Flash) to read the sticker colours. 

The user points their phone camera at one corner of the cube so 3 faces are visible at once.

Please answer these questions to help me design the best camera guide overlay:
1. What is the ideal angle to hold the cube (degrees from straight-on)?
2. How much of the frame should the cube fill (what % of the image)?
3. What lighting conditions work best vs worst?
4. What are the most commonly confused colour pairs and how can the user avoid them?
5. What framing/composition tips would make your colour detection most accurate?
6. Is there anything specific about 4x4 cubes (vs 3x3) that affects detection?

Be specific and practical."""

    payload = json.dumps({
        "contents": [{"parts": [{"text": question}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 1024}
    }).encode("utf-8")

    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        return f"<html><body style='font-family:sans-serif;padding:2rem;max-width:800px;margin:0 auto;line-height:1.6'><pre style='white-space:pre-wrap;font-size:14px'>{text}</pre></body></html>"
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route("/test-key")
def test_key():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"status": "MISSING"})
    # Test a real Gemini call with a simple text prompt
    import urllib.request, json
    test_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = json.dumps({"contents":[{"parts":[{"text":"Reply with just the word: working"}]}]}).encode()
    req = urllib.request.Request(test_url, data=payload, headers={"Content-Type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode())
        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        return jsonify({"status": "OK", "gemini_reply": text, "key_preview": api_key[:8]+"..."})
    except urllib.error.HTTPError as e:
        return jsonify({"status": "HTTP_ERROR", "code": e.code, "body": e.read().decode()[:300]})
    except Exception as e:
        return jsonify({"status": "ERROR", "error": str(e)})

@app.route("/analyze-corner", methods=["POST"])
def analyze_corner():
    # Read key fresh on every request so env var changes take effect immediately
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"ok": False, "error": "GEMINI_API_KEY not set on server"}), 500

    data      = request.get_json()
    image_b64 = data.get("image", "")
    corner    = data.get("corner", "first")

    if corner == "first":
        face_prompt = """This is a photo of a 4x4 Rubik's cube taken from a corner angle so 3 faces are visible at once.

Your job: identify the colour of every sticker on each of the 3 visible faces.

The 3 faces are:
- TOP: the face on top, tilted away from you
- LEFT: the face on the left side
- RIGHT: the face on the right side

For each face, read the 4x4 grid of 16 stickers in order: row 1 left to right, then row 2 left to right, then row 3, then row 4.

The 6 possible colours are: white, yellow, red, orange, blue, green.
Be very precise — orange and red are different, white and yellow are different.

Return ONLY valid JSON with no extra text, no markdown, no explanation:
{"top":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"],"left":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"],"right":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"]}

Each array must have exactly 16 colour values."""
    else:
        face_prompt = """This is a photo of a 4x4 Rubik's cube taken from the OPPOSITE corner to the first photo. 3 different faces are now visible.

Your job: identify the colour of every sticker on each of the 3 visible faces.

The 3 faces are:
- BOTTOM: the face on the bottom, tilted away from you
- LEFT: the face on the left side
- RIGHT: the face on the right side

For each face, read the 4x4 grid of 16 stickers in order: row 1 left to right, then row 2 left to right, then row 3, then row 4.

The 6 possible colours are: white, yellow, red, orange, blue, green.
Be very precise — orange and red are different, white and yellow are different.

Return ONLY valid JSON with no extra text, no markdown, no explanation:
{"bottom":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"],"left":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"],"right":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"]}

Each array must have exactly 16 colour values."""

    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": face_prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}}
            ]
        }],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 512}
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{GEMINI_URL}?key={api_key}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        if "error" in result:
            return jsonify({"ok": False, "error": result["error"].get("message", "Gemini API error")})

        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        text = re.sub(r"```json|```", "", text).strip()
        faces = json.loads(text)
        return jsonify({"ok": True, "faces": faces})

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return jsonify({"ok": False, "error": f"HTTP {e.code}: {body[:300]}"})
    except urllib.error.URLError as e:
        return jsonify({"ok": False, "error": f"URL error: {str(e)}"})
    except json.JSONDecodeError as e:
        return jsonify({"ok": False, "error": f"Bad JSON from Gemini: {text[:200]}"})
    except KeyError as e:
        return jsonify({"ok": False, "error": f"Unexpected Gemini response structure: {str(result)[:300]}"})
    except Exception as e:
        return jsonify({"ok": False, "error": f"{type(e).__name__}: {str(e)}"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
