import os, io, base64, json
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# Pulling from Render Environment Variables
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-2.5-flash')

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/ping")
def ping():
    return "OK", 200

@app.route("/config")
def get_config():
    return jsonify({
        "url": os.environ.get("SUPABASE_URL"),
        "key": os.environ.get("SUPABASE_ANON_KEY")
    })

@app.route("/scan-face", methods=["POST"])
def scan_face():
    try:
        data = request.get_json()
        image_b64 = data['image'].split(",")[1]
        img = Image.open(io.BytesIO(base64.b64decode(image_b64)))

        prompt = """Identify the 16 stickers on this 4x4 Rubik's cube face (top-left to bottom-right). 
        Return ONLY a JSON list of strings: 'white', 'yellow', 'red', 'orange', 'blue', 'green'."""
        
        response = model.generate_content([prompt, img])
        clean_json = response.text.replace("```json", "").replace("```", "").strip()
        return jsonify({"success": True, "colors": json.loads(clean_json)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
