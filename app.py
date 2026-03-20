from flask import Flask, render_template, request, jsonify
import os, json, re, time
import urllib.request
from collections import defaultdict

app = Flask(__name__, static_folder='static', static_url_path='/static')

VALID_CODES = [
    "CUBE-4829", "CUBE-1147", "CUBE-3301", "CUBE-7755", "CUBE-0042",
]

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

# ── SERVER-SIDE RATE LIMITING ─────────────────────────────
# Track requests per IP — max 10 per minute
request_counts = defaultdict(list)
RATE_LIMIT     = 10   # max requests
RATE_WINDOW    = 60   # per 60 seconds

def is_rate_limited(ip):
    now    = time.time()
    window = request_counts[ip]
    # Remove entries older than the window
    request_counts[ip] = [t for t in window if now - t < RATE_WINDOW]
    if len(request_counts[ip]) >= RATE_LIMIT:
        return True
    request_counts[ip].append(now)
    return False

# ── IMAGE COMPRESSION ─────────────────────────────────────
# Compress base64 image before sending to Gemini
# We resize to 640px max on the server side as a safety net
def compress_image_b64(b64_str, max_size=640):
    try:
        import base64
        from io import BytesIO
        try:
            from PIL import Image
        except ImportError:
            return b64_str  # PIL not available, use as-is
        
        img_bytes = base64.b64decode(b64_str)
        img       = Image.open(BytesIO(img_bytes))
        
        # Resize if too large
        w, h = img.size
        if max(w, h) > max_size:
            ratio = max_size / max(w, h)
            img   = img.resize((int(w*ratio), int(h*ratio)), Image.LANCZOS)
        
        # Re-encode at 85% quality
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=85, optimize=True)
        return base64.b64encode(buf.getvalue()).decode('utf-8')
    except Exception:
        return b64_str  # fallback to original if anything fails

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    code = data.get("code", "").strip().upper()
    return jsonify({"valid": code in VALID_CODES})

@app.route("/analyze-corner", methods=["POST"])
def analyze_corner():
    # ── Rate limit check ──
    ip = request.headers.get("X-Forwarded-For", request.remote_addr).split(",")[0].strip()
    if is_rate_limited(ip):
        return jsonify({"ok": False, "error": "Too many requests. Please wait a moment and try again."}), 429

    # ── Get API key fresh every request ──
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"ok": False, "error": "GEMINI_API_KEY not set on server"}), 500

    data      = request.get_json()
    image_b64 = data.get("image", "")
    corner    = data.get("corner", "first")

    # ── Compress image before sending ──
    image_b64 = compress_image_b64(image_b64, max_size=800)

    if corner == "first":
        face_prompt = """This is a photo of a 4x4 Rubik's cube taken from a corner angle so 3 faces are visible at once.

Your job: identify the colour of every sticker on each of the 3 visible faces.

The 3 faces are:
- TOP: the face on top, tilted away from you
- LEFT: the face on the left side
- RIGHT: the face on the right side

For each face, read the 4x4 grid of 16 stickers in order: row 1 left to right, then row 2 left to right, then row 3, then row 4.

The 6 possible colours are: white, yellow, red, orange, blue, green.
Be very precise — orange and red are different, white and yellow are different.

Return ONLY valid JSON with no extra text, no markdown, no explanation:
{"top":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"],"left":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"],"right":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"]}

Each array must have exactly 16 colour values."""
    else:
        face_prompt = """This is a photo of a 4x4 Rubik's cube taken from the OPPOSITE corner to the first photo. 3 different faces are now visible.

Your job: identify the colour of every sticker on each of the 3 visible faces.

The 3 faces are:
- BOTTOM: the face on the bottom, tilted away from you
- LEFT: the face on the left side
- RIGHT: the face on the right side

For each face, read the 4x4 grid of 16 stickers in order: row 1 left to right, then row 2 left to right, then row 3, then row 4.

The 6 possible colours are: white, yellow, red, orange, blue, green.
Be very precise — orange and red are different, white and yellow are different.

Return ONLY valid JSON with no extra text, no markdown, no explanation:
{"bottom":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"],"left":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"],"right":["colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour","colour"]}

Each array must have exactly 16 colour values."""

    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": face_prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}}
            ]
        }],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 512}
    }).encode("utf-8")

    # ── Exponential backoff retry ──────────────────────────
    last_error = ""
    for attempt in range(4):  # up to 4 attempts
        try:
            req = urllib.request.Request(
                f"{GEMINI_URL}?key={api_key}",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "CubeSolverApp/1.0"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=45) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")})

            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"```json|```", "", text).strip()
            faces = json.loads(text)

            # Validate response has correct keys and 16 values each
            expected_keys = ["top","left","right"] if corner=="first" else ["bottom","left","right"]
            for key in expected_keys:
                if key not in faces or len(faces[key]) != 16:
                    raise ValueError(f"Invalid response: {key} missing or wrong length")

            return jsonify({"ok": True, "faces": faces})

        except urllib.error.HTTPError as e:
            body       = e.read().decode("utf-8")
            last_error = f"HTTP {e.code}"
            if e.code == 429:
                # Exponential backoff: 2s, 4s, 8s, 16s
                wait = 2 ** (attempt + 1)
                time.sleep(wait)
                continue
            elif e.code in [500, 503]:
                # Server error — retry after short wait
                time.sleep(3)
                continue
            else:
                return jsonify({"ok": False, "error": f"Gemini API error {e.code}"})

        except urllib.error.URLError as e:
            last_error = f"Network error"
            time.sleep(2 ** attempt)
            continue

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            last_error = f"Response error: {str(e)}"
            time.sleep(2)
            continue

        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e)}"
            time.sleep(2)
            continue

    return jsonify({"ok": False, "error": f"Could not get a response after multiple attempts. {last_error}. Please try again in a moment."})

@app.route("/ask-gemini")
def ask_gemini():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"error": "no key"})
    question = """I am building a web app that photographs a 4x4 Rubik's cube and sends the image to you (Gemini 2.5 Flash) to read the sticker colours. The user points their phone camera at one corner of the cube so 3 faces are visible at once. Please answer: 1) ideal angle, 2) how much of frame cube should fill, 3) best lighting, 4) most confused colour pairs, 5) framing tips, 6) anything specific about 4x4 vs 3x3."""
    payload = json.dumps({"contents":[{"parts":[{"text":question}]}],"generationConfig":{"temperature":0.1,"maxOutputTokens":1024}}).encode()
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",data=payload,headers={"Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=30) as resp:
            result=json.loads(resp.read().decode())
        text=result["candidates"][0]["content"]["parts"][0]["text"].strip()
        return f"<html><body style='font-family:sans-serif;padding:2rem;max-width:800px;margin:0 auto;line-height:1.6'><pre style='white-space:pre-wrap;font-size:14px'>{text}</pre></body></html>"
    except Exception as e:
        return jsonify({"error":str(e)})

@app.route("/test-key")
def test_key():
    api_key = os.environ.get("GEMINI_API_KEY","")
    if not api_key:
        return jsonify({"status":"MISSING"})
    payload=json.dumps({"contents":[{"parts":[{"text":"Reply with just the word: working"}]}]}).encode()
    req=urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",data=payload,headers={"Content-Type":"application/json"},method="POST")
    try:
        with urllib.request.urlopen(req,timeout=15) as resp:
            result=json.loads(resp.read().decode())
        text=result["candidates"][0]["content"]["parts"][0]["text"].strip()
        return jsonify({"status":"OK","gemini_reply":text,"key_preview":api_key[:8]+"..."})
    except urllib.error.HTTPError as e:
        return jsonify({"status":"HTTP_ERROR","code":e.code,"body":e.read().decode()[:300]})
    except Exception as e:
        return jsonify({"status":"ERROR","error":str(e)})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
