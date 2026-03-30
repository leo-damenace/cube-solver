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
         You are a deterministic 4×4 Rubik’s Cube solver. You must NOT guess or hallucinate. Treat this like a state reconstruction + verification + solve pipeline.

INPUT:
You will receive 4 images of the SAME cube:

- Image 1: Front + Right + Top  
- Image 2: Back + Left + Bottom (cube rotated 180° from Image 1)  
- Image 3: Front + Left (same orientation as Image 1)  
- Image 4: Back + Right (same orientation as Image 2)

--------------------------------
PHASE 1 — RECONSTRUCTION
--------------------------------
Reconstruct the FULL cube state:

- Identify all 24 center pieces (4 per face)
- Identify all 24 edge pieces (paired into 12 edges)
- Identify all 8 corner pieces

Output the reconstructed cube state in a structured format:
- List each face (U, D, F, B, L, R)
- Provide a 4×4 grid of colors for each face

--------------------------------
PHASE 2 — VALIDATION
--------------------------------
Before solving, verify:

- Each color appears exactly 16 times
- All pieces exist exactly once (no duplicates or missing pieces)
- The cube is physically solvable for a 4×4
- Edge pairings are consistent

If ANY issue is found:
→ STOP and ask for clearer images
→ DO NOT proceed to solving

--------------------------------
PHASE 3 — SOLVE
--------------------------------
Solve using a correct 4×4 method:

1. Solve centers  
2. Pair edges  
3. Solve as a 3×3  
4. Detect and fix parity (OLL/PLL if present)

--------------------------------
PHASE 4 — SELF-CHECK
--------------------------------
Before output:

- Verify the move sequence would solve the reconstructed state
- Ensure no unnecessary repetition or random patterns
- Ensure logical consistency

--------------------------------
OUTPUT FORMAT
--------------------------------
Return:

1. "RECONSTRUCTED STATE:" (faces with 4×4 grids)
2. "VALIDATION: PASSED" (or failure reason)
3. "SOLUTION:" followed by ONE clean move sequence

Use standard notation:
R L U D F B Rw Lw Uw Dw Fw Bw
' = counterclockwise
2 = double turn

--------------------------------
CRITICAL RULES
--------------------------------
- Do NOT invent cube states
- Do NOT output a solution without reconstruction
- Do NOT generate long repetitive sequences unless mathematically required
- If uncertain, ASK for clarification instead of guessing

Accuracy is required.

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
