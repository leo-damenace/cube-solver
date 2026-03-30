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

        f"You are given {num} photos of the same scrambled cube from different angles:\n"
        "- Photo 1 and 2 are from opposite corners, each showing 3 faces simultaneously\n"
        "- Photo 3 and 4 are additional angles to clarify any remaining stickers\n\n"

        "STEP 1 — Read the cube:\n"
        "Use all 4 photos together to identify every sticker on all 6 faces. "
        "Figure out which colour belongs on which face by looking at the photos. "
        "Do not assume any orientation — determine it yourself from what you see.\n\n"

        "STEP 2 — Choose your own orientation:\n"
        "Pick whichever face orientation makes the solve easiest. "
        "Tell the user exactly how to hold the cube: which colour goes on top and which colour faces them.\n\n"

        "STEP 3 — Solve using the Yau method:\n"
        "1. Solve the two opposite centres first (bottom and back)\n"
        "2. Pair 3 bottom cross edges\n"
        "3. Solve remaining 4 centres\n"
        "4. Pair all remaining edges\n"
        "5. Finish like a 3x3 (CFOP: cross, F2L, OLL, PLL)\n"
        "6. If OLL parity: Rw U2 x Rw U2 Rw' U2 Rw' U2 Lw' U2 Rw U2 Rw' U2 Rw' U2 x' Rw'\n"
        "7. If PLL parity: Rw2 U2 Rw2 Uw2 Rw2 Uw2\n\n"

        "MOVE NOTATION:\n"
        "U U' U2, D D' D2, F F' F2, B B' B2, L L' L2, R R' R2 = single face turns\n"
        "Uw Uw' Uw2, Dw Dw' Dw2, Rw Rw' Rw2, Lw Lw' Lw2, Fw Fw' Fw2, Bw Bw' Bw2 = wide two-layer turns\n\n"

        "REQUIREMENTS:\n"
        "- Wide moves are mandatory. You cannot solve a 4x4 without them.\n"
        "- Solution must be 40-100 moves. Under 30 moves is wrong.\n"
        "- No repeating patterns. Every move must be purposeful.\n"
        "- No explanations or commentary in the output.\n\n"

        "OUTPUT EXACTLY THIS AND NOTHING ELSE:\n\n"
        "ORIENTATION:\n"
        "[tell the user which colour to put on top and which colour to face toward them]\n\n"
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
