from flask import Flask, render_template, request, jsonify
import os, base64, json, re
import urllib.request

app = Flask(__name__, static_folder='static', static_url_path='/static')

VALID_CODES = [
    "CUBE-4829", "CUBE-1147", "CUBE-3301", "CUBE-7755", "CUBE-0042",
]

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent"

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    code = data.get("code", "").strip().upper()
    return jsonify({"valid": code in VALID_CODES})

@app.route("/analyze-corner", methods=["POST"])
def analyze_corner():
    """
    Receives a base64 image of a cube corner (3 faces visible).
    corner: "first" or "second"
    Sends to Gemini which returns the sticker colours for the 3 visible faces.
    """
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY not set"}), 500

    data      = request.get_json()
    image_b64 = data.get("image", "")
    corner    = data.get("corner", "first")  # "first" or "second"

    if corner == "first":
        face_prompt = """
You are looking at a 4x4 Rubik's cube from one corner. You can see exactly 3 faces.
Label them: TOP (the face on top), LEFT (the face on the left), RIGHT (the face on the right).

For each face, read the 4x4 grid of sticker colours from top-left to bottom-right, row by row.
Each sticker is one of: white, yellow, red, orange, blue, green.

Return ONLY a JSON object in this exact format, no other text:
{
  "top":   ["colour","colour",...],  (16 values)
  "left":  ["colour","colour",...],  (16 values)
  "right": ["colour","colour",...]   (16 values)
}
"""
    else:
        face_prompt = """
You are looking at a 4x4 Rubik's cube from the OPPOSITE corner to the first photo.
You can see exactly 3 faces that were NOT visible in the first photo.
Label them: BOTTOM (the face on the bottom), LEFT (the face on the left), RIGHT (the face on the right).

For each face, read the 4x4 grid of sticker colours from top-left to bottom-right, row by row.
Each sticker is one of: white, yellow, red, orange, blue, green.

Return ONLY a JSON object in this exact format, no other text:
{
  "bottom": ["colour","colour",...],  (16 values)
  "left":   ["colour","colour",...],  (16 values)
  "right":  ["colour","colour",...]   (16 values)
}
"""

    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": face_prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}}
            ]
        }],
        "generationConfig": {"temperature": 0}
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{GEMINI_URL}?key={GEMINI_API_KEY}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Strip markdown code fences if present
        text = re.sub(r"```json|```", "", text).strip()
        faces = json.loads(text)
        return jsonify({"ok": True, "faces": faces})
    except Exception as e:
        return jsonify({"error": str(e), "ok": False}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
