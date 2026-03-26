import os, io, base64, json
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# This pulls the key from Render's secret environment variables
# It never appears in your GitHub or source code
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/scan-face", methods=["POST"])
def scan_face():
    # Only the server talks to Gemini. The user never sees the API key.
    try:
        data = request.get_json()
        image_b64 = data['image'].split(",")[1]
        img = Image.open(io.BytesIO(base64.b64decode(image_b64)))

        prompt = "Identify the 16 stickers on this 4x4 cube face. Return JSON list only."
        response = model.generate_content([prompt, img])
        
        return jsonify({"success": True, "colors": json.loads(response.text)})
    except Exception as e:
        return jsonify({"success": False, "error": "Detection failed"}), 500
