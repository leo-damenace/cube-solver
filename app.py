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
        face_prompt = """Look at this 4x4 Rubik's cube photo. You can see 3 faces from a corner angle.
Call them: TOP (facing up), LEFT (facing left), RIGHT (facing right).
For each face read all 16 stickers left-to-right, top-to-bottom.
Each sticker colour is one of: white, yellow, red, orange, blue, green.
Reply with ONLY this JSON, no other text:
{"top":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],"left":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],"right":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]}
Replace each "c" with the actual colour name."""
    else:
        face_prompt = """Look at this 4x4 Rubik's cube photo. You can see 3 faces from a corner angle.
Call them: BOTTOM (facing down), LEFT (facing left), RIGHT (facing right).
For each face read all 16 stickers left-to-right, top-to-bottom.
Each sticker colour is one of: white, yellow, red, orange, blue, green.
Reply with ONLY this JSON, no other text:
{"bottom":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],"left":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],"right":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]}
Replace each "c" with the actual colour name."""

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

        # Check for API error in response
        if "error" in result:
            return jsonify({"ok": False, "error": result["error"].get("message", "Gemini API error")}), 500

        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        text = re.sub(r"```json|```", "", text).strip()
        faces = json.loads(text)
        return jsonify({"ok": True, "faces": faces})

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return jsonify({"ok": False, "error": f"HTTP {e.code}: {body[:200]}"}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
