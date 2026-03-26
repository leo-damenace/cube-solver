import os, io, base64, json
from flask import Flask, render_template, request, jsonify
from supabase import create_client, Client
import google.generativeai as genai
from PIL import Image

app = Flask(__name__)

# --- Configuration ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Initialize Clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
genai.configure(api_key=GEMINI_API_KEY)
vision_model = genai.GenerativeModel('gemini-2.5-flash')

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/ping")
def ping():
    """Endpoint for cron-job.org to keep Render awake."""
    return "OK", 200

@app.route("/scan-face", methods=["POST"])
def scan_face():
    try:
        data = request.get_json()
        image_b64 = data['image'].split(",")[1]
        img = Image.open(io.BytesIO(base64.b64decode(image_b64)))

        # Specific prompt for 4x4 accuracy
        prompt = """
        This is one face of a 4x4 Rubik's cube. 
        Identify the 16 stickers in a 4x4 grid (reading order: top-left to bottom-right).
        Return ONLY a JSON list of strings using these labels: 
        'white', 'yellow', 'red', 'orange', 'blue', 'green'.
        Example: ["white", "red", "blue", ...]
        """
        
        response = vision_model.generate_content([prompt, img])
        # Clean up Gemini's markdown if present
        raw_text = response.text.replace("```json", "").replace("```", "").strip()
        colors = json.loads(raw_text)
        
        return jsonify({"success": True, "colors": colors})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
