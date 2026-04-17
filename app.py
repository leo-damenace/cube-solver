from flask import Flask, render_template, request, jsonify
import os, json, re, time
import urllib.request
from collections import defaultdict

app = Flask(__name__, static_folder='static', static_url_path='/static')

GEMINI_URL   = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")  # service role key for server-side writes
MEM0_API_KEY = os.environ.get("MEM0_API_KEY", "")
MEM0_USER_ID = "cubesolve-gemini-agent"  # fixed agent identity so memories persist across all solves

# ── RATE LIMITING ─────────────────────────────────────────
request_log = defaultdict(list)

def is_rate_limited(ip):
    now = time.time()
    request_log[ip] = [t for t in request_log[ip] if now - t < 60]
    if len(request_log[ip]) >= 8:
        return True
    request_log[ip].append(now)
    return False

# ── HTTP HELPERS ──────────────────────────────────────────
def http_post(url, payload_dict, headers, timeout=120):
    payload = json.dumps(payload_dict).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def http_get(url, headers, timeout=30):
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def gemini_post(api_key, payload_dict, timeout=180):
    return http_post(
        f"{GEMINI_URL}?key={api_key}",
        payload_dict,
        {"Content-Type": "application/json", "User-Agent": "CubeSolveApp/1.0"},
        timeout
    )

# ── MEM0: retrieve memories ───────────────────────────────
def mem0_search(query):
    """Search Mem0 for relevant memories about past solving errors."""
    if not MEM0_API_KEY:
        return []
    try:
        result = http_get(
            f"https://api.mem0.ai/v1/memories/search/?query={urllib.request.quote(query)}&user_id={MEM0_USER_ID}&limit=10",
            {"Authorization": f"Token {MEM0_API_KEY}", "Content-Type": "application/json"}
        )
        memories = result.get("results", result if isinstance(result, list) else [])
        return [m.get("memory", "") for m in memories if m.get("memory")]
    except Exception as e:
        print(f"Mem0 search error: {e}")
        return []

# ── MEM0: store a new memory ──────────────────────────────
def mem0_add(content):
    """Store a new memory in Mem0 — used to log what went wrong and what was learned."""
    if not MEM0_API_KEY:
        return
    try:
        http_post(
            "https://api.mem0.ai/v1/memories/",
            {
                "messages": [{"role": "assistant", "content": content}],
                "user_id": MEM0_USER_ID
            },
            {"Authorization": f"Token {MEM0_API_KEY}", "Content-Type": "application/json"}
        )
    except Exception as e:
        print(f"Mem0 add error: {e}")

# ── SUPABASE: log error to table ──────────────────────────
def supabase_log_error(face_desc, bad_solution, error_type, lesson):
    """Insert a row into the gemini_errors table in Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
    try:
        http_post(
            f"{SUPABASE_URL}/rest/v1/gemini_errors",
            {
                "face_description": face_desc[:2000],  # truncate for storage
                "bad_solution":     bad_solution[:500] if bad_solution else None,
                "error_type":       error_type,
                "lesson":           lesson,
                "created_at":       time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            },
            {
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type":  "application/json",
                "Prefer":        "return=minimal"
            }
        )
    except Exception as e:
        print(f"Supabase log error: {e}")

# ── SUPABASE: fetch recent errors ─────────────────────────
def supabase_get_recent_errors(limit=10):
    """Pull the most recent error lessons from Supabase to inject into the prompt."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/gemini_errors?select=error_type,lesson&order=created_at.desc&limit={limit}",
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type":  "application/json"
            },
            method="GET"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
            return rows if isinstance(rows, list) else []
    except Exception as e:
        print(f"Supabase fetch error: {e}")
        return []

# ── ROUTES ────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html",
        supabase_url=os.environ.get("SUPABASE_URL", ""),
        supabase_anon_key=os.environ.get("SUPABASE_ANON_KEY", "")
    )

@app.route("/report-error", methods=["POST"])
def report_error():
    """
    Called by the frontend when the user reports that the solution was wrong.
    Logs to Supabase + Mem0 so future solves learn from it.
    """
    data         = request.get_json()
    face_desc    = data.get("face_desc", "")
    bad_solution = data.get("solution", "")
    error_type   = data.get("error_type", "wrong_solution")
    lesson       = data.get("lesson", "Solution did not solve the cube. Review colour reading and solving logic.")

    # Log to Supabase table
    supabase_log_error(face_desc, bad_solution, error_type, lesson)

    # Store in Mem0 as a persistent memory
    mem0_add(f"CUBE SOLVER ERROR LOG — {error_type}: {lesson} | Bad solution started with: {bad_solution[:80]}")

    return jsonify({"ok": True})

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

    # ── STEP 1: Read colours from photos ──────────────────
    colour_prompt = """You are reading the sticker colours of a scrambled 4x4 Rubik's cube.

Look at all photos. Identify all 6 faces: U (top), D (bottom), F (front), B (back), L (left), R (right).
For each face, read the 4x4 grid of 16 stickers left-to-right, top-to-bottom.
Each sticker must be exactly one of: white, yellow, red, orange, blue, green

Return ONLY this JSON, no markdown, no explanation:
{
  "U": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "D": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "F": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "B": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "L": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"],
  "R": ["c","c","c","c","c","c","c","c","c","c","c","c","c","c","c","c"]
}
Each array must have exactly 16 values. Use only: white, yellow, red, orange, blue, green."""

    parts = [{"text": colour_prompt}]
    for img_b64 in images:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": img_b64}})

    faces      = None
    last_error = ""
    for attempt in range(3):
        try:
            result = gemini_post(api_key, {
                "contents": [{"parts": parts}],
                "generationConfig": {"temperature": 0, "maxOutputTokens": 4096}
            })
            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini error")})

            text  = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text  = re.sub(r"```json|```", "", text).strip()
            faces = json.loads(text)

            valid_colours = {"white","yellow","red","orange","blue","green"}
            for face in ["U","D","F","B","L","R"]:
                if face not in faces or len(faces[face]) != 16:
                    raise ValueError(f"Face {face} missing or wrong length")
                for c in faces[face]:
                    if c.lower().strip() not in valid_colours:
                        raise ValueError(f"Invalid colour '{c}' in face {face}")
            break

        except Exception as e:
            last_error = str(e)
            time.sleep(2)

    if faces is None:
        return jsonify({"ok": False, "error": f"Could not read cube colours: {last_error}"})

    # ── Build face description for the solver ─────────────
    face_desc = ""
    for face, label in [("U","TOP"),("D","BOTTOM"),("F","FRONT"),("B","BACK"),("L","LEFT"),("R","RIGHT")]:
        stickers = faces[face]
        rows = [" | ".join(stickers[r*4:(r+1)*4]) for r in range(4)]
        face_desc += f"\n{label} face ({face}):\n" + "\n".join(rows) + "\n"

    # ── STEP 2: Pull memory context ───────────────────────
    # Get relevant past errors from Mem0
    mem0_memories = mem0_search("4x4 cube solving error wrong moves notation")

    # Get recent errors from Supabase
    recent_errors = supabase_get_recent_errors(limit=8)
    error_lessons = "\n".join([f"- [{r.get('error_type','')}] {r.get('lesson','')}" for r in recent_errors])

    mem0_context = "\n".join([f"- {m}" for m in mem0_memories]) if mem0_memories else ""

    memory_block = ""
    if error_lessons or mem0_context:
        memory_block = f"""
IMPORTANT — LESSONS FROM PAST MISTAKES (learn from these):
{error_lessons}
{mem0_context}
Do NOT repeat these errors.
"""

    # ── STEP 3: Solve with memory-augmented prompt ────────
    solve_prompt = f"""You are an expert 4x4 Rubik's cube solver. You MUST produce a correct, working solution.
{memory_block}
Here is the current state of a scrambled 4x4 cube:
{face_desc}

RULES:
1. This is a 4x4 — NO fixed centres. Infer the colour scheme from the overall state.
2. Use ONLY standard WCA 4x4 notation:
   - Outer layers: U D F B L R (with ' and 2)
   - Wide (2-layer) moves: Uw Dw Fw Bw Lw Rw (with ' and 2)
   - Inner slices: u d f b l r lowercase (with ' and 2)
3. Do NOT invent notation. Do NOT use numbers like U1 or B3.
4. Think step by step: centres first → edge pairing → 3x3 reduction → OLL/PLL parity if needed.
5. Your solution must actually solve the cube from the state shown above.

Return ONLY this JSON when done, no markdown, no explanation:
{{"solution": "move1 move2 move3 ..."}}"""

    for attempt in range(3):
        try:
            result = gemini_post(api_key, {
                "contents": [{"parts": [{"text": solve_prompt}]}],
                "generationConfig": {
                    "temperature": 0,
                    "maxOutputTokens": 8192,
                    "thinkingConfig": {"thinkingBudget": 10000}
                }
            })

            if "error" in result:
                return jsonify({"ok": False, "error": result["error"].get("message", "Gemini solver error")})

            text = ""
            for part in result["candidates"][0]["content"]["parts"]:
                if not part.get("thought", False):
                    text += part.get("text", "")
            text     = re.sub(r"```json|```", "", text.strip()).strip()
            parsed   = json.loads(text)
            solution = parsed.get("solution", "").strip()

            if not solution:
                raise ValueError("Empty solution")

            moves = solution.split()

            return jsonify({
                "ok":         True,
                "solution":   solution,
                "move_count": len(moves),
                "face_desc":  face_desc  # sent back so frontend can attach to error reports
            })

        except Exception as e:
            last_error = str(e)
            time.sleep(2)

    return jsonify({"ok": False, "error": f"Could not generate solution: {last_error}"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
