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
    return NORMALIZE.get(c.lower().strip(), c.lower().strip())

# ── SAFE JSON EXTRACTION ──────────────────────────────────
def extract_json(raw_text):
    match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found")

    json_str = match.group(0)

    # fix trailing commas
    json_str = re.sub(r",\s*}", "}", json_str)
    json_str = re.sub(r",\s*]", "]", json_str)

    return json.loads(json_str)

# ── VALIDATION ────────────────────────────────────────────
def validate_faces(faces):
    for face in ["U","D","F","B","L","R"]:
        if face not in faces:
            raise ValueError(f"Missing face {face}")

        if len(faces[face]) != 16:
            raise ValueError(f"{face} has wrong length")

        for c in faces[face]:
            if c not in VALID_COLOURS:
                raise ValueError(f"Invalid colour: {c}")

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

    base_prompt = f"""I am sending you {len(images)} photo(s) of the same 4x4 Rubik's cube taken from different angles.

Identify ALL 6 faces: U, D, F, B, L, R.

Each face is a 4x4 grid (16 stickers), read left-to-right, top-to-bottom.

STRICT RULES:
- Output MUST be valid JSON
- NO markdown, NO backticks, NO explanation
- ONLY lowercase colour names
- ONLY allowed: white, yellow, red, orange, blue, green
- Each face must have exactly 16 values
- Each colour must appear exactly 16 times total

Return ONLY:
{{
  "U": [...16],
  "D": [...16],
  "F": [...16],
  "B": [...16],
  "L": [...16],
  "R": [...16]
}}"""

    parts = [{"text": base_prompt}]
    for img in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": img}})

    payload = json.dumps({
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 1024,
            "response_mime_type": "application/json"
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

            # ── Extract JSON safely
            faces = extract_json(raw)

            # ── Normalize colours
            for face in faces:
                faces[face] = [normalize_colour(c) for c in faces[face]]

            # ── Validate
            validate_faces(faces)

            return jsonify({"ok": True, "faces": faces})

        except Exception as e:
            last_error = str(e)

            # smarter retry prompt
            parts[0]["text"] = f"""Your previous response was invalid.

Return ONLY valid JSON.

Rules:
- Faces: U, D, F, B, L, R
- 16 values each
- Only: white, yellow, red, orange, blue, green
- No extra text

Fix your output."""

            time.sleep(2 ** (attempt + 1))
            continue

    return jsonify({"ok": False, "error": f"Failed after retries: {last_error}"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
