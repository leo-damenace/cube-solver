from flask import Flask, render_template, request, jsonify
import os, json, time
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

    num = len(images)
    prompt = (
        "You are solving a physical 4x4x4 Rubik's Revenge cube. NOT a 3x3. "
        "Each face is a 4x4 grid of 16 stickers. There are no fixed centres.\n\n"

        f"You have {num} photos of the same scrambled cube. "
        "Photos 1 and 2 are from opposite corners each showing 3 faces at once. "
        "Photos 3 and 4 are extra angles to fill in any missing stickers. "
        "Use all photos together to determine the exact state of every sticker on all 6 faces.\n\n"

        "Choose the best orientation to solve from. Then write the ORIENTATION section by telling "
        "the user how to get the cube into that position starting from how it looks in Photo 1. "
        "For example: 'Start from Photo 1 position, rotate 180 degrees to the right' or "
        "'Start from Photo 1 position, flip upside down, then rotate 90 degrees left' — "
        "whatever simple physical moves get the cube from Photo 1 into your chosen solving orientation. "
        "Be specific and clear so anyone can follow it.\n\n"

        "Then solve the cube using the Yau method in this order:\n"
        "1. Solve two opposite centres (bottom and back)\n"
        "2. Pair 3 bottom cross edges\n"
        "3. Solve remaining 4 centres\n"
        "4. Pair all remaining edges\n"
        "5. Finish like a 3x3 using CFOP (cross, F2L, OLL, PLL)\n"
        "6. Fix OLL parity if needed: Rw U2 x Rw U2 Rw' U2 Rw' U2 Lw' U2 Rw U2 Rw' U2 Rw' U2 x' Rw'\n"
        "7. Fix PLL parity if needed: Rw2 U2 Rw2 Uw2 Rw2 Uw2\n\n"

        "Notation:\n"
        "Single layer: U U' U2 / D D' D2 / F F' F2 / B B' B2 / L L' L2 / R R' R2\n"
        "Wide two layers: Uw Uw' Uw2 / Dw Dw' Dw2 / Rw Rw' Rw2 / Lw Lw' Lw2 / Fw Fw' Fw2 / Bw Bw' Bw2\n\n"

        "Requirements:\n"
        "- Must use wide moves (Uw, Rw, Lw, Fw, Bw, Dw) — impossible to solve 4x4 without them\n"
        "- Solution must be 40-100 moves long\n"
        "- No repeated patterns\n"
        "- No explanations in output\n\n"

        "Output only this, nothing else:\n\n"
        "ORIENTATION:\n"
        "[clear physical instructions referencing Photo 1 to get cube into solving position]\n\n"
        "SOLUTION:\n"
        "[all moves on one line separated by spaces]"
    )

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
