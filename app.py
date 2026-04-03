from flask import Flask, render_template, request, jsonify
import os, json, re, time
import urllib.request
from collections import defaultdict

app = Flask(__name__, static_folder='static', static_url_path='/static')

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

# ── RATE LIMITING ─────────────────────────────────────────
request_log = defaultdict(list)

def is_rate_limited(ip):
    now = time.time()
    request_log[ip] = [t for t in request_log[ip] if now - t < 60]
    if len(request_log[ip]) >= 8:
        return True
    request_log[ip].append(now)
    return False

# ── ROUTES ────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html",
        supabase_url=os.environ.get("SUPABASE_URL", ""),
        supabase_anon_key=os.environ.get("SUPABASE_ANON_KEY", "")
    )

@app.route("/analyze", methods=["POST"])
def analyze():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr).split(",")[0].strip()
    if is_rate_limited(ip):
        return jsonify({"ok": False, "error": "Too many requests. Please wait a moment."}), 429

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"ok": False, "error": "Server misconfigured — GEMINI_API_KEY missing."}), 500

    data   = request.get_json()
    images = data.get("images", [])  # list of up to 4 base64 strings

    if not images or len(images) < 1:
        return jsonify({"ok": False, "error": "No images received."}), 400

    prompt = f"""You are an expert at identifying Rubik's Cube colors from images. I am sending you {len(images)} photo(s) of the same 4x4 Rubik's cube taken from different angles. Your task is to accurately identify the color of each of the 16 stickers on ALL 6 faces of the cube.

Here are the 6 faces and their standard center colors for a 4x4x4 cube:
- TOP (U): White center
- BOTTOM (D): Yellow center
- FRONT (F): Green center
- BACK (B): Blue center
- LEFT (L): Orange center
- RIGHT (R): Red center

For each face, read the 4x4 grid of 16 stickers from left-to-right, top-to-bottom, row by row. The only valid sticker colors are: white, yellow, red, orange, blue, green. If a color is ambiguous, choose the closest one from this list.

Important considerations:
- Analyze all provided photos together to ensure a complete and accurate reading of all 6 faces. Some faces might only be partially visible in certain photos.
- Pay close attention to distinguishing between similar colors like orange/red and white/yellow, especially under varying lighting conditions. Use context from other stickers and photos to make the best judgment.
- Ensure that the final output represents a physically possible cube state. For a solved 4x4x4 cube, each of the 6 colors appears exactly 16 times across all faces. Your output should reflect this distribution as closely as possible, even if some stickers are obscured or difficult to discern.

Return ONLY a JSON object, with no additional markdown, text, or explanation. The JSON structure must be as follows:
{{
  "U": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "D": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "F": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "B": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "L": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "R": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]
}}

Replace every "c" with one of the exact color names: "white", "yellow", "red", "orange", "blue", "green". Each array must contain exactly 16 color strings."""

    parts = [{"text": prompt}]
    for img_b64 in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": img_b64}})

    payload = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 1024}
    }).encode("utf-8")

    last_error = ""
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                f"{GEMINI_URL}?key={api_key}",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "CubeSolveApp/1.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")}), 500

            text  = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            # Remove markdown code block fences if present
            text  = re.sub(r"```json|```", "", text).strip()
            faces = json.loads(text)

            # Validate structure and content
            expected_faces = ["U","D","F","B","L","R"]
            valid_colors = {"white", "yellow", "red", "orange", "blue", "green"}
            all_colors = []

            if not isinstance(faces, dict):
                raise ValueError("Gemini response is not a JSON object.")

            for face_key in expected_faces:
                if face_key not in faces:
                    raise ValueError(f"Missing face: {face_key}")
                if not isinstance(faces[face_key], list):
                    raise ValueError(f"Face {face_key} is not a list.")
                if len(faces[face_key]) != 16:
                    raise ValueError(f"Face {face_key} has {len(faces[face_key])} stickers, expected 16.")
                for color in faces[face_key]:
                    if not isinstance(color, str) or color.lower() not in valid_colors:
                        raise ValueError(f"Invalid color '{color}' found on face {face_key}.")
                    all_colors.append(color.lower())
            
            # Validate color distribution (each color must appear 16 times)
            color_counts = defaultdict(int)
            for color in all_colors:
                color_counts[color] += 1
            
            for color_name in valid_colors:
                if color_counts[color_name] != 16:
                    raise ValueError(f"Color '{color_name}' appears {color_counts[color_name]} times, expected 16.")

            return jsonify({"ok": True, "faces": faces})

        except urllib.error.HTTPError as e:
            body = e.read().decode()
            last_error = f"HTTP {e.code}"
            if e.code in [429, 500, 503]:
                time.sleep(2 ** (attempt + 1))
                continue
            return jsonify({"ok": False, "error": f"Gemini API error {e.code}: {body[:200]}"}), 500

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            last_error = str(e)
            time.sleep(2)
            continue

        except Exception as e:
            last_error = str(e)
            time.sleep(2)
            continue

    return jsonify({"ok": False, "error": f"Failed after retries: {last_error}"}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
 
