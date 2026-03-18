from flask import Flask, render_template, request, jsonify
import os

app = Flask(__name__, static_folder='static', static_url_path='/static')

# ── INVITE CODES ──────────────────────────────────────────
# Add or remove codes here. Share them privately.
VALID_CODES = [
    "CUBE-4829",
    "CUBE-1147",
    "CUBE-3301",
    "CUBE-7755",
    "CUBE-0042",
]

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/verify-code", methods=["POST"])
def verify_code():
    data = request.get_json()
    code = data.get("code", "").strip().upper()
    if code in VALID_CODES:
        return jsonify({"valid": True})
    return jsonify({"valid": False})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
