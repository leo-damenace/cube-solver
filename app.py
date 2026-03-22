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

# Single letter codes — keeps response tiny
COLOR_DECODE = {"W":"white","Y":"yellow","R":"red","O":"orange","B":"blue","G":"green"}

# Per-face prompt — dead simple, one face at a time
def make_face_prompt(face_name, face_desc):
    return (
        f"4x4 Rubik's cube photo. Look at the {face_name} face ({face_desc}).\n"
        f"Read its 4x4 grid of stickers left-to-right top-to-bottom.\n"
        f"Use ONLY: W=white Y=yellow R=red O=orange B=blue G=green\n"
        f"Return ONLY a JSON array of exactly 16 single letters, nothing else:\n"
        f'["","","","","","","","","","","","","","","",""]'
    )

# Shot prompts for shots 1 & 2 (3 faces, compact)
SHOT_PROMPTS = {
    1: (
        "4x4 Rubik's cube, TOP-FRONT-RIGHT corner view. 3 faces visible.\n"
        "U=Top(up) F=Front(toward camera) R=Right(right side).\n"
        "Read each face 4x4 grid left-to-right top-to-bottom.\n"
        "Use ONLY single letters: W=white Y=yellow R=red O=orange B=blue G=green\n"
        "Return ONLY this JSON, absolutely no other text:\n"
        '{"U":["","","","","","","","","","","","","","","",""],'
        '"F":["","","","","","","","","","","","","","","",""],'
        '"R":["","","","","","","","","","","","","","","",""]}'
    ),
    2: (
        "4x4 Rubik's cube, BOTTOM-BACK-LEFT corner view. 3 faces visible.\n"
        "D=Bottom(now facing up) B=Back(far face) L=Left(left side).\n"
        "Read each face 4x4 grid left-to-right top-to-bottom as if looking straight at each face.\n"
        "Use ONLY single letters: W=white Y=yellow R=red O=orange B=blue G=green\n"
        "Return ONLY this JSON, absolutely no other text:\n"
        '{"D":["","","","","","","","","","","","","","","",""],'
        '"B":["","","","","","","","","","","","","","","",""],'
        '"L":["","","","","","","","","","","","","","","",""]}'
    ),
}

# For shots 3 & 4 (band shots), we ask about each face individually
BAND_FACES = {
    "F": "FRONT face — the face directly facing the camera in the band",
    "R": "RIGHT face — the face on the right side in the band",
    "B": "BACK face — the face facing away from camera in the band",
    "L": "LEFT face — the face on the left side in the band",
}

SHOT_FACES = {
    1: ["U","F","R"],
    2: ["D","B","L"],
    3: ["F","R","B","L"],
    4: ["F","R","B","L"],
}

VALID_COLORS = {"white","yellow","red","orange","blue","green"}


def call_gemini_raw(prompt, image_b64):
    """Single Gemini call — returns parsed JSON (list or dict)."""
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < _MIN_GAP:
        time.sleep(_MIN_GAP - elapsed + random.uniform(0.2, 0.8))

    payload = json.dumps({
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": "image/jpeg", "data": image_b64}},
        ]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 512}
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
            raw = raw.strip()
            if raw.startswith("[") and not raw.endswith("]"):
                raw = raw.rstrip(", \n") + "]"
            return json.loads(raw)
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
        c = str(c).strip().upper()
        # Accept single-letter code or full word
        if c in COLOR_DECODE:
            out.append(COLOR_DECODE[c])
        else:
            c_lower = c.lower()
            out.append(c_lower if c_lower in {"white","yellow","red","orange","blue","green"} else "white")
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
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY not set"}), 500

    data   = request.get_json()
    images = data.get("images", {})

    if len(images) != 4:
        return jsonify({"error": "Need exactly 4 images"}), 400

    all_faces = {}

    # Shots 1 & 2: 3 faces each — compact enough for one call
    for shot in [1, 2]:
        img = images.get(str(shot), "")
        if not img:
            return jsonify({"error": f"Missing image for shot {shot}"}), 400
        try:
            result = call_gemini_raw(SHOT_PROMPTS[shot], img)
            all_faces = merge(all_faces, result, SHOT_FACES[shot])
        except Exception as e:
            return jsonify({"error": f"Shot {shot} failed: {str(e)}"}), 500

    # Shots 3 & 4: ask ONE face at a time — prevents truncation
    for shot in [3, 4]:
        img = images.get(str(shot), "")
        if not img:
            return jsonify({"error": f"Missing image for shot {shot}"}), 400
        for fk, face_desc in BAND_FACES.items():
            try:
                prompt = make_face_prompt(fk, face_desc)
                result = call_gemini_raw(prompt, img)
                if isinstance(result, list):
                    all_faces = merge(all_faces, {fk: validate(result)}, [fk])
            except Exception as e:
                return jsonify({"error": f"Shot {shot} face {fk} failed: {str(e)}"}), 500

    for fk in ["U","F","R","D","B","L"]:
        if fk not in all_faces:
            all_faces[fk] = ["white"] * 16

    return jsonify({"faces": all_faces})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
