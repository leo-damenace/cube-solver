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
        f"4x4 Rubik's cube. Identify the {face_desc}.\n"
        f"Output ONLY a JSON array of exactly 16 color letters.\n"
        f"Letters: W=white Y=yellow R=red O=orange B=blue G=green\n"
        f"Start your response with [ and end with ]. No other text.\n"
        f'["","","","","","","","","","","","","","","",""]'
    )

# ALL shots now use per-face calls — one face at a time, never truncates
# Face descriptions per shot context
SHOT_FACE_DESCS = {
    1: {
        "U": "TOP face — the face pointing upward (you're looking down at the top-right-front corner)",
        "F": "FRONT face — the face pointing toward the camera",
        "R": "RIGHT face — the face on the right side",
    },
    2: {
        "D": "BOTTOM face — was the bottom, now tilted up toward the camera",
        "B": "BACK face — the face pointing away from camera",
        "L": "LEFT face — the face on the left side",
    },
    3: {
        "F": "FRONT face — facing the camera in the side-band view",
        "R": "RIGHT face — on the right in the side-band view",
        "B": "BACK face — facing away in the side-band view",
        "L": "LEFT face — on the left in the side-band view",
    },
    4: {
        "F": "FRONT face — facing the camera (cube rotated 90° from shot 3)",
        "R": "RIGHT face — on the right (cube rotated 90°)",
        "B": "BACK face — facing away (cube rotated 90°)",
        "L": "LEFT face — on the left (cube rotated 90°)",
    },
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
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 256
        }
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

            # Strip any preamble Gemini adds before the array
            start = raw.find("[")
            if start > 0:
                raw = raw[start:]

            # Strip markdown fences
            raw = re.sub(r"^```[a-z]*\n?", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"\n?```$", "", raw)
            raw = raw.strip()

            # Ensure array is closed (stopSequences strips the "]")
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

    # Every shot: one Gemini call per face — never truncates
    for shot in [1, 2, 3, 4]:
        img = images.get(str(shot), "")
        if not img:
            return jsonify({"error": f"Missing image for shot {shot}"}), 400
        for fk, face_desc in SHOT_FACE_DESCS[shot].items():
            try:
                prompt = make_face_prompt(fk, face_desc)
                result = call_gemini_raw(prompt, img)
                if isinstance(result, list):
                    all_faces = merge(all_faces, {fk: validate(result)}, [fk])
                elif isinstance(result, dict) and fk in result:
                    all_faces = merge(all_faces, {fk: validate(result[fk])}, [fk])
            except Exception as e:
                return jsonify({"error": f"Shot {shot} face {fk} failed: {str(e)}"}), 500

    for fk in ["U","F","R","D","B","L"]:
        if fk not in all_faces:
            all_faces[fk] = ["white"] * 16

    return jsonify({"faces": all_faces})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
