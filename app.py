import os
import base64
import io
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# Securely pull the key from Render's environment settings
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/analyze-batch", methods=["POST"])
def analyze_batch():
    data = request.get_json()
    image_data = data.get("image")
    view_type = data.get("type")

    img_bytes = base64.b64decode(image_data)
    img = Image.open(io.BytesIO(img_bytes))

    prompt = f"""
    This is a 4x4 Rubik's Cube. This photo is a {view_type}.
    Identify every visible sticker color. 
    Return a JSON mapping of faces (up, down, left, right, front, back) to 4x4 color grids.
    Colors: white, yellow, red, orange, blue, green.
    """

    response = model.generate_content([prompt, img])
    return jsonify({"analysis": response.text})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
