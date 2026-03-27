import os
import base64
import io
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# Connects to your Gemini Key in Render
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

@app.route("/")
def index():
    # Hands Supabase keys to the HTML
    return render_template("index.html", 
                           sb_url=os.environ.get("SUPABASE_URL", ""), 
                           sb_key=os.environ.get("SUPABASE_ANON_KEY", ""))

@app.route("/solve-4x4", methods=["POST"])
def solve_4x4():
    data = request.get_json()
    image_data = data.get("image")
    step = data.get("step")

    img_bytes = base64.b64decode(image_data)
    img = Image.open(io.BytesIO(img_bytes))

    prompt = f"4x4 Rubik's Cube {step} view. Return JSON color map."
    response = model.generate_content([prompt, img])
    return jsonify({"result": response.text})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
