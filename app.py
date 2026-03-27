import os
import base64
import io
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# Fetching the Key from Render Environment Variables
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_KEY)
model = genai.GenerativeModel('gemini-1.5-flash')

@app.route("/")
def index():
    # Passing the Supabase keys to the frontend securely via the template
    return render_template("index.html", 
                           sb_url=os.environ.get("SUPABASE_URL"), 
                           sb_key=os.environ.get("SUPABASE_ANON_KEY"))

@app.route("/analyze-batch", methods=["POST"])
def analyze_batch():
    data = request.get_json()
    image_data = data.get("image")
    view_type = data.get("type")

    img_bytes = base64.b64decode(image_data)
    img = Image.open(io.BytesIO(img_bytes))

    prompt = f"4x4 Rubik's Cube {view_type} analysis. Return a JSON map of colors for visible faces."
    response = model.generate_content([prompt, img])
    return jsonify({"analysis": response.text})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
