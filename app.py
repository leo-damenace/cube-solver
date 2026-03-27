import os
import base64
import io
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# This grabs the Gemini key from your Render Environment Variables
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

@app.route("/")
def index():
    # THIS IS THE KEY: It grabs the Supabase info from Render 
    # and passes it to the HTML variables 'sb_url' and 'sb_key'
    return render_template("index.html", 
                           sb_url=os.environ.get("SUPABASE_URL", ""), 
                           sb_key=os.environ.get("SUPABASE_ANON_KEY", ""))

@app.route("/solve-4x4", methods=["POST"])
def solve_4x4():
    data = request.get_json()
    image_data = data.get("image")
    step = data.get("step")

    if not image_data:
        return jsonify({"error": "No image"}), 400

    img_bytes = base64.b64decode(image_data)
    img = Image.open(io.BytesIO(img_bytes))

    prompt = f"Analyze this 4x4 Rubik's Cube {step} view. Return color mapping."
    response = model.generate_content([prompt, img])
    return jsonify({"result": response.text})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
