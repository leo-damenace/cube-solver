from flask import Flask, render_template, request, jsonify
import os, json, re, time, random
import urllib.request, urllib.error

app = Flask(__name__)

@app.after_request
def no_cache(response):
    if "static" in response.headers.get("Content-Type","") or request.path.startswith("/static"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"]        = "no-cache"
        response.headers["Expires"]       = "0"
    return response

VALID_CODES = ["CUBE-4829","CUBE-1147","CUBE-3301","CUBE-7755","CUBE-0042"]

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.5-flash:generateContent?key=" + GEMINI_API_KEY
)

_last_request_time = 0
_MIN_GAP = 4.0

SHOT_PROMPTS = {
    1: (
        "4x4 Rubik's cube, TOP-FRONT-RIGHT corner view. 3 faces visible.\n"
        "TOP face = facing up. FRONT face = facing camera. RIGHT face = on the right.\n"
        "Read each face 4x4 grid left-to-right top-to-bottom.\n"
        "Colors: white yellow red orange blue green ONLY.\n"
        "Return ONLY JSON, no markdown:\n"
        '{"U":["","","","","","","","","","","","","","","",""],'
        '"F":["","","","","","","","","","","","","","","",""],'
        '"R":["","","","","","","","","","","","","","","",""]}'
    ),
    2: (
        "4x4 Rubik's cube, BOTTOM-BACK-LEFT corner view. 3 faces visible.\n"
        "BOTTOM face = now facing up toward camera. BACK face = far face. LEFT face = on left.\n"
        "Read each face 4x4 grid left-to-right top-to-bottom as if looking straight at each face.\n"
        "Colors: white yellow red orange blue green ONLY.\n"
        "Return ONLY JSON, no markdown:\n"
        '{"D":["","","","","","","","","","","","","","","",""],'
        '"B":["","","","","","","","","","","","","","","",""],'
        '"L":["","","","","","","","","","","","","","","",""]}'
    ),
    3: (
        "4x4 Rubik's cube held horizontally showing the SIDE BAND.\n"
        "All 4 side faces visible going around: FRONT, RIGHT, BACK, LEFT.\n"
        "Read each face 4x4 grid left-to-right top-to-bottom.\n"
        "Colors: white yellow red orange blue green ONLY.\n"
        "Return ONLY JSON, no markdown:\n"
        '{"F":["","","","","","","","","","","","","","","",""],'
        '"R":["","","","","","","","","","","","","","","",""],'
        '"B":["","","","","","","","","","","","","","","",""],'
        '"L":["","","","","","","","","","","","","","","",""]}'
    ),
    4: (
        "4x4 Rubik's cube held horizontally showing the SIDE BAND, rotated 90 degrees from previous shot.\n"
        "All 4 side faces visible: FRONT, RIGHT, BACK, LEFT from new angle.\n"
        "Read each face 4x4 grid left-to-right top-to-bottom.\n"
        "Colors: white yellow red orange blue green ONLY.\n"
        "Return ONLY JSON, no markdown:\n"
        '{"F":["","","","","","","","","","","","","","","",""],'
        '"R":["","","","","","","","","","","","","","","",""],'
        '"B":["","","","","","","","","","","","","","","",""],'
        '"L":["","","","","","","","","","","","","","","",""]}'
    ),
}

SHOT_FACES = {
    1: ["U","F","R"],
    2: ["D","B","L"],
    3: ["F","R","B","L"],
    4: ["F","R","B","L"],
}

VALID_COLORS = {"white","yellow","red","orange","blue","green"}


def call_gemini(image_b64, shot):
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < _MIN_GAP:
        time.sleep(_MIN_GAP - elapsed + random.uniform(0.2, 0.8))

    payload = json.dumps({
        "contents": [{"parts": [
            {"text": SHOT_PROMPTS[shot]},
            {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
        ]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 2048}
    }).encode()

    wait = 5
    for attempt in range(5):
        try:
            _last_request_time = time.time()
            req = urllib.request.Request(
                GEMINI_URL, data=payload,
                headers={"Content-Type": "application/json"}, method="POST"
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.loads(resp.read())
            raw = body["candidates"][0]["content"]["parts"][0]["text"].strip()
            raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\n?```$", "", raw)
            return json.loads(raw.strip())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                time.sleep(wait + random.uniform(1, 3))
                wait *= 2
                continue
            try:
                msg = json.loads(e.read()).get("error",{}).get("message", str(e))
            except Exception:
                msg = str(e)
            raise RuntimeError(f"Gemini error {e.code}: {msg}")
        except Exception as ex:
            raise RuntimeError(str(ex))


def validate(colors):
    out = []
    for c in (colors or []):
        c = str(c).lower().strip()
        out.append(c if c in VALID_COLORS else "white")
    while len(out) < 16:
        out.append("white")
    return out[:16]


def merge(existing, new_data, faces):
    """Merge new scan into existing — per-sticker: if disagree, trust new reading."""
    for fk in faces:
        new_colors = validate(new_data.get(fk, []))
        if fk not in existing:
            existing[fk] = new_colors
        else:
            existing[fk] = [
                old if old == new else new
                for old, new in zip(existing[fk], new_colors)
            ]
    return existing


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    return jsonify({"valid": data.get("code","").strip().upper() in VALID_CODES})


@app.route("/analyze-all", methods=["POST"])
def analyze_all():
    """
    Receives all 4 images at once, runs them through Gemini sequentially,
    merges results, returns complete 6-face color data.
    """
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY not set"}), 500

    data   = request.get_json()
    images = data.get("images", {})  # {"1": b64, "2": b64, "3": b64, "4": b64}

    if len(images) != 4:
        return jsonify({"error": "Need exactly 4 images"}), 400

    all_faces = {}
    for shot in [1, 2, 3, 4]:
        img = images.get(str(shot), "")
        if not img:
            return jsonify({"error": f"Missing image for shot {shot}"}), 400
        try:
            result = call_gemini(img, shot)
            all_faces = merge(all_faces, result, SHOT_FACES[shot])
        except Exception as e:
            return jsonify({"error": f"Shot {shot} failed: {str(e)}"}), 500

    # Validate all 6 faces present
    for fk in ["U","F","R","D","B","L"]:
        if fk not in all_faces:
            all_faces[fk] = ["white"] * 16

    return jsonify({"faces": all_faces})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
