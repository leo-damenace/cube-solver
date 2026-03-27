import os
import base64
import io
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# This pulls your Gemini Key from Render's Environment Variables
# Make sure GEMINI_API_KEY is set in your Render dashboard
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

@app.route("/")
def index():
    # This pulls Supabase keys from Render and sends them to the HTML
    # This is why your JavaScript was saying "Invalid URL" before
    return render_template("index.html", 
                           sb_url=os.environ.get("SUPABASE_URL", ""), 
                           sb_key=os.environ.get("SUPABASE_ANON_KEY", ""))

@app.route("/analyze-batch", methods=["POST"])
def analyze_batch():
    data = request.get_json()
    image_data = data.get("image")
    view_type = data.get("type")

    if not image_data:
        return jsonify({"error": "No image data"}), 400

    # Convert base64 image string to actual bytes for Gemini
    img_bytes = base64.b64decode(image_data)
    img = Image.open(io.BytesIO(img_bytes))

    # The prompt for the 4x4 mapping
    prompt = f"""
    This is a 4x4 Rubik's Cube. This photo is a {view_type} view.
    Identify all visible sticker colors. 
    Return a JSON mapping of faces to 4x4 color grids.
    Colors: white, yellow, red, orange, blue, green.
    """

    try:
        response = model.generate_content([prompt, img])
        return jsonify({"analysis": response.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Render uses the PORT environment variable
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
