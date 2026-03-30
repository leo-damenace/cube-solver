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
        "You are an expert 4x4x4 Rubik's Cube (Revenge Cube) solver with deep knowledge of the reduction method.\n\n"

        "THIS IS A 4x4x4 CUBE. Each face has 4 rows and 4 columns = 16 stickers. "
        "There are 6 faces: U (top), D (bottom), F (front), B (back), L (left), R (right).\n\n"

        f"I am sending you {num} photos of a scrambled 4x4x4 cube from different angles. "
        "Orient it with WHITE on top (U) and GREEN facing you (F). "
        "This means: RED=R, ORANGE=L, YELLOW=D, BLUE=B.\n\n"

        "Step 1: Read each face carefully from the photos. For each face, mentally map the 4x4 grid of 16 stickers.\n\n"

        "Step 2: Solve the cube using the REDUCTION METHOD in this order:\n"
        "  Phase 1 - Solve the 6 centres (each centre is a 2x2 block of same-colour stickers)\n"
        "  Phase 2 - Pair up all 12 edges (each edge has 2 matching stickers)\n"
        "  Phase 3 - Solve like a 3x3 using standard CFOP or layer-by-layer\n"
        "  Phase 4 - Fix any parity errors (OLL parity: Rw U2 x Rw U2 Rw U2 Rw' U2 Lw U2 Rw' U2 Rw U2 Rw' U2 Rw', "
        "PLL parity: Rw2 U2 Rw2 Uw2 Rw2 Uw2)\n\n"

        "Step 3: Output the full verified move sequence.\n\n"

        "RULES:\n"
        "- Use ONLY these moves: U U' U2, D D' D2, F F' F2, B B' B2, L L' L2, R R' R2, "
        "Uw Uw' Uw2, Dw Dw' Dw2, Fw Fw' Fw2, Bw Bw' Bw2, Lw Lw' Lw2, Rw Rw' Rw2\n"
        "- Wide moves (Uw, Rw, etc.) move the 2 outer layers together\n"
        "- A real 4x4 solve is 40-100 moves. Anything under 20 moves is wrong.\n"
        "- Do NOT repeat the same short pattern over and over\n"
        "- Every move must be purposeful and advance the solve\n\n"

        "OUTPUT FORMAT (nothing else, no explanations):\n\n"
        "ORIENTATION:\n"
        "Hold cube with WHITE on top and GREEN facing you.\n\n"
        "SOLUTION:\n"
        "[the complete move sequence on one line]"
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
