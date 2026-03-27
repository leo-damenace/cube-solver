import os
import base64
import io
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# Configure Gemini
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/solve", methods=["POST"])
def solve():
    data = request.get_json()
    image_data = data.get("image")
    
    if not image_data:
        return jsonify({"error": "No image"}), 400

    # Convert base64 to Image
    img_bytes = base64.b64decode(image_data)
    img = Image.open(io.BytesIO(img_bytes))

    prompt = """
    Analyze this Rubik's Cube face (4x4). 
    Return exactly 16 color names in a simple list, starting from top-left to bottom-right.
    Use only these labels: white, yellow, red, orange, blue, green.
    Example output: [white, white, red, ...]
    """

    response = model.generate_content([prompt, img])
    # Basic cleaning of the response text to get the list
    colors_text = response.text.replace('[', '').replace(']', '').replace(' ', '').lower()
    colors_list = colors_text.split(',')

    return jsonify({"colors": colors_list})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
