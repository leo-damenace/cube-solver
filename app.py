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

# ── COLOUR NORMALIZATION ──────────────────────────────────
NORMALIZE = {
    "white": "white", "w": "white",
    "yellow": "yellow", "y": "yellow",
    "red": "red",
    "orange": "orange",
    "blue": "blue",
    "green": "green",

    # common Gemini mistakes
    "light red": "red",
    "dark red": "red",
    "pink": "red",
    "light orange": "orange",
    "dark orange": "orange",
    "gold": "yellow",
    "cream": "white",
}

VALID_COLOURS = {"white","yellow","red","orange","blue","green"}

def normalize_colour(c):
    if not isinstance(c, str):
        return "white"
    return NORMALIZE.get(c.lower().strip(), c.lower().strip())

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
    images = data.get("images", [])

    if not images:
        return jsonify({"ok": False, "error": "No images received."}), 400

    prompt = f"""I am sending you {len(images)} photo(s) of the same 4x4 Rubik's cube.

Identify all 6 faces: U, D, F, B, L, R.

Each face has 16 colours (4x4 grid).
Only use: white, yellow, red, orange, blue, green.

Return JSON only."""

    parts = [{"text": prompt}]
    for img in images:
        parts.append({
            "inline_data": {
                "mime_type": "image/jpeg",
                "data": img
            }
        })

    payload = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 1024
        }
    }).encode("utf-8")

    last_error = ""

    for attempt in range(4):
        try:
            req = urllib.request.Request(
                f"{GEMINI_URL}?key={api_key}",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST"
            )

            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            raw = result["candidates"][0]["content"]["parts"][0]["text"]

            # ── STEP 1: Extract JSON safely ─────────────────
            try:
                match = re.search(r"\{.*\}", raw, re.DOTALL)
                json_str = match.group(0) if match else "{}"

                # Fix common JSON issues
                json_str = re.sub(r",\s*}", "}", json_str)
                json_str = re.sub(r",\s*]", "]", json_str)

                parsed = json.loads(json_str)
            except:
                parsed = {}

            # ── STEP 2: Build SAFE cube (NEVER FAIL) ─────────
            faces = {}
            for face in ["U","D","F","B","L","R"]:
                arr = parsed.get(face, [])

                if not isinstance(arr, list):
                    arr = []

                clean = []
                for c in arr:
                    c = normalize_colour(c)
                    if c not in VALID_COLOURS:
                        c = "white"
                    clean.append(c)

                # ensure exactly 16
                clean = (clean + ["white"] * 16)[:16]

                faces[face] = clean

            # ── ALWAYS RETURN SUCCESS ───────────────────────
            return jsonify({
                "ok": True,
                "faces": faces,
                "warning": None if parsed else "Low confidence scan — please verify colours."
            })

        except Exception as e:
            last_error = str(e)
            time.sleep(2 ** (attempt + 1))
            continue

    # ── FINAL FALLBACK (ABSOLUTE GUARANTEE) ────────────────
    fallback_faces = {
        f: ["white"] * 16 for f in ["U","D","F","B","L","R"]
    }

    return jsonify({
        "ok": True,
        "faces": fallback_faces,
        "warning": "Scan failed — showing blank cube. Please set colours manually."
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
