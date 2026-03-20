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
request_counts = defaultdict(list)
RATE_LIMIT = 5
RATE_WINDOW = 60

def is_rate_limited(ip):
    now = time.time()
    request_counts[ip] = [t for t in request_counts[ip] if now - t < RATE_WINDOW]
    if len(request_counts[ip]) >= RATE_LIMIT:
        return True
    request_counts[ip].append(now)
    return False

# ── IMAGE COMPRESSION (Pillow) ────────────────────────────
def compress_image(b64_str, max_size=800):
    try:
        import base64
        from io import BytesIO
        from PIL import Image
        img_bytes = base64.b64decode(b64_str)
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        w, h = img.size
        if max(w, h) > max_size:
            ratio = max_size / max(w, h)
            img = img.resize((int(w*ratio), int(h*ratio)), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=85, optimize=True)
        return base64.b64encode(buf.getvalue()).decode('utf-8')
    except Exception:
        return b64_str

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    code = data.get("code", "").strip().upper()
    return jsonify({"valid": code in VALID_CODES})

@app.route("/analyze-both", methods=["POST"])
def analyze_both():
    # Rate limit
    ip = request.headers.get("X-Forwarded-For", request.remote_addr).split(",")[0].strip()
    if is_rate_limited(ip):
        return jsonify({"ok": False, "error": "Too many requests. Please wait a moment."}), 429

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return jsonify({"ok": False, "error": "GEMINI_API_KEY not set"}), 500

    data = request.get_json()

    # Compress both images
    img1 = compress_image(data.get("image1", ""), max_size=800)
    img2 = compress_image(data.get("image2", ""), max_size=800)

    prompt = """I am sending you TWO photos of the same 4x4 Rubik's cube taken from opposite corners.

PHOTO 1 (first image): Shows 3 faces.
- TOP: the face on top
- LEFT: the face on the left
- RIGHT: the face on the right

PHOTO 2 (second image): Shows the other 3 faces.
- BOTTOM: the face on the bottom
- LEFT: the face on the left
- RIGHT: the face on the right

For each face, read all 16 stickers left-to-right, top-to-bottom, row by row.
Colours are exactly one of: white, yellow, red, orange, blue, green.
Be precise — orange vs red and white vs yellow are the most common mistakes.

Return ONLY this JSON, no markdown, no explanation, nothing else:
{"photo1":{"top":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],"left":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],"right":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]},"photo2":{"bottom":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],"left":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],"right":["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]}}

Replace every "c" with the actual colour name. Each array must have exactly 16 values."""

    payload = json.dumps({
        "contents": [{
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": "image/jpeg", "data": img1}},
                {"inline_data": {"mime_type": "image/jpeg", "data": img2}}
            ]
        }],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 1024}
    }).encode("utf-8")

    # Exponential backoff — up to 4 attempts
    last_error = ""
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                f"{GEMINI_URL}?key={api_key}",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "CubeSolverApp/1.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")})

            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = re.sub(r"```json|```", "", text).strip()
            data_out = json.loads(text)

            # Validate structure
            p1 = data_out.get("photo1", {})
            p2 = data_out.get("photo2", {})
            for key in ["top","left","right"]:
                if key not in p1 or len(p1[key]) != 16:
                    raise ValueError(f"photo1.{key} missing or wrong length")
            for key in ["bottom","left","right"]:
                if key not in p2 or len(p2[key]) != 16:
                    raise ValueError(f"photo2.{key} missing or wrong length")

            return jsonify({"ok": True, "photo1": p1, "photo2": p2})

        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8")
            last_error = f"HTTP {e.code}"
            if e.code in [429, 500, 503]:
                wait = 2 ** (attempt + 1)  # 2, 4, 8, 16 seconds
                time.sleep(wait)
                continue
            return jsonify({"ok": False, "error": f"Gemini API error {e.code}"})

        except (urllib.error.URLError, json.JSONDecodeError, ValueError, KeyError) as e:
            last_error = str(e)
            time.sleep(2 ** attempt)
            continue

        except Exception as e:
            last_error = f"{type(e).__name__}: {str(e)}"
            time.sleep(2)
            continue

    return jsonify({"ok": False, "error": f"Failed after retries: {last_error}"})

@app.route("/test-key")
def test_key():
    api_key = os.environ.get("GEMINI_API_KEY","")
    if not api_key:
        return jsonify({"status":"MISSING"})
    payload = json.dumps({"contents":[{"parts":[{"text":"Reply: working"}]}]}).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
        data=payload, headers={"Content-Type":"application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode())
        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        return jsonify({"status":"OK","reply":text,"key":api_key[:8]+"..."})
    except Exception as e:
        return jsonify({"status":"ERROR","error":str(e)})

@app.route("/ask-gemini")
def ask_gemini():
    api_key = os.environ.get("GEMINI_API_KEY","")
    if not api_key:
        return jsonify({"error":"no key"})
    question = "I am building a 4x4 Rubik's cube solver app. I send you 2 photos from opposite corners. What makes a good photo for colour detection? Best angle, lighting, framing tips."
    payload = json.dumps({"contents":[{"parts":[{"text":question}]}],"generationConfig":{"temperature":0.1,"maxOutputTokens":1024}}).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}",
        data=payload, headers={"Content-Type":"application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
        text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        return f"<html><body style='font-family:sans-serif;padding:2rem;max-width:800px;margin:0 auto;line-height:1.6'><pre style='white-space:pre-wrap'>{text}</pre></body></html>"
    except Exception as e:
        return jsonify({"error":str(e)})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
