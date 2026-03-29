from flask import Flask, render_template, request, jsonify
import os, json, re, time
import urllib.request
from collections import defaultdict

app = Flask(__name__, static_folder='static', static_url_path='/static')

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

request_log = defaultdict(list)

def is_rate_limited(ip):
    now = time.time()
    request_log[ip] = [t for t in request_log[ip] if now - t < 60]
    if len(request_log[ip]) >= 8:
        return True
    request_log[ip].append(now)
    return False

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
        return jsonify({"ok": False, "error": "GEMINI_API_KEY missing"}), 500

    data   = request.get_json()
    images = data.get("images", [])
    if not images:
        return jsonify({"ok": False, "error": "No images received"}), 400

    prompt = f"""I am sending you {len(images)} photo(s) of a 4x4 Rubik's cube.

Read ALL 6 faces. For each face give me the 4x4 grid of 16 stickers, row by row left to right.
Use only these exact colour words: white, yellow, red, orange, blue, green.

Return ONLY this JSON:
{{
  "U": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "D": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "F": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "B": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "L": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "R": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]
}}

Every array must have exactly 16 colour words. No markdown, no explanation."""

    parts = [{"text": prompt}]
    for img_b64 in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": img_b64}})

    payload = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 4096}
    }).encode("utf-8")

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
            return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")})

        raw = result["candidates"][0]["content"]["parts"][0]["text"].strip()
        return jsonify({"ok": True, "raw": raw})

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
