// ═══════════════════════════════════════════════════════
//  CubeSolve — script.js
// ═══════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────
let supabaseClient = null;
let currentUser    = null;
let photosTaken    = [];
let currentMoves   = [];
let currentFaceDesc = "";
let isAnalysing    = false;

// ── INIT SUPABASE ─────────────────────────────────────────
window.addEventListener("load", () => {
  supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );
  supabaseClient.auth.getSession().then(({ data }) => {
    if (data.session) showApp(data.session.user);
  });
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session.user);
    else         showAuth();
  });
});

// ── AUTH ──────────────────────────────────────────────────
document.getElementById("google-btn").onclick = async () => {
  const btn = document.getElementById("google-btn");
  btn.disabled    = true;
  btn.textContent = "Signing in...";
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options:  { redirectTo: window.location.origin }
  });
  if (error) {
    document.getElementById("auth-error").textContent = error.message;
    btn.disabled  = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Sign in with Google`;
  }
};

async function signOut() {
  await supabaseClient.auth.signOut();
  showAuth();
  doRestart();
}

function showAuth() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app").style.display         = "none";
  currentUser = null;
}

function showApp(user) {
  currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display         = "block";
  const name   = user.user_metadata?.full_name || user.email || "User";
  const avatar = user.user_metadata?.avatar_url;
  document.getElementById("user-name").textContent = name;
  const avatarEl = document.getElementById("user-avatar");
  if (avatar) avatarEl.innerHTML = `<img src="${avatar}" alt="${name}"/>`;
  else        avatarEl.textContent = name.charAt(0).toUpperCase();
  startCamera();
}

// ── CAMERA ────────────────────────────────────────────────
async function startCamera() {
  const video = document.getElementById("camera");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    video.play();
  } catch (err) {
    showBanner("Camera error: " + err.message, "error");
  }
}

// ── TAKE PHOTO ────────────────────────────────────────────
function takePhoto() {
  if (isAnalysing) return;
  const video = document.getElementById("camera");
  const count = photosTaken.length;
  if (count >= 4) return;

  const snap  = document.createElement("canvas");
  const maxW  = 800;
  const scale = Math.min(1, maxW / (video.videoWidth || 1280));
  snap.width  = Math.floor((video.videoWidth  || 1280) * scale);
  snap.height = Math.floor((video.videoHeight || 720)  * scale);
  snap.getContext("2d").drawImage(video, 0, 0, snap.width, snap.height);
  const b64 = snap.toDataURL("image/jpeg", 0.82).split(",")[1];

  photosTaken.push(b64);

  const slot = document.getElementById(`slot-${count}`);
  slot.innerHTML = `<img src="data:image/jpeg;base64,${b64}"/><div class="photo-slot-label">Photo ${count+1}</div>`;
  slot.classList.add("taken");
  markStep(count, "done");

  if (photosTaken.length < 4) {
    markStep(photosTaken.length, "active");
    document.getElementById("shot-num").textContent   = photosTaken.length + 1;
    document.getElementById("main-title").textContent = `TAKE PHOTO ${photosTaken.length + 1}`;
    const descs = [
      "Point at the front of the cube so at least 3 faces are visible.",
      "Rotate and show the back — capture the other faces.",
      "Tilt to show the top face clearly.",
      "Flip to show the bottom face."
    ];
    document.getElementById("main-desc").textContent = descs[photosTaken.length] || "";
    showBanner(`✅ Photo ${count+1} saved! ${4 - photosTaken.length} more to go.`);
  } else {
    document.getElementById("capture-btn").style.display = "none";
    document.getElementById("restart-btn").style.display = "block";
    document.getElementById("main-title").textContent    = "SOLVING...";
    document.getElementById("main-desc").textContent     = "Gemini is reading your cube and calculating the solution.";
    analysePhotos();
  }
}

// ── SEND TO GEMINI ────────────────────────────────────────
async function analysePhotos() {
  isAnalysing = true;
  showBanner("🤖 Gemini is reading and solving your cube...");

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 180000);

  try {
    const res = await fetch("/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ images: photosTaken }),
      signal:  controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();

    if (!data.ok) {
      showBanner("⚠️ " + data.error, "error");
      isAnalysing = false;
      document.getElementById("capture-btn").style.display = "block";
      document.getElementById("capture-btn").textContent   = "📸 Retake Last Photo";
      document.getElementById("capture-btn").onclick = () => {
        photosTaken.pop();
        const slot = document.getElementById(`slot-${photosTaken.length}`);
        slot.innerHTML = `<div class="photo-slot-empty">Photo ${photosTaken.length+1}<br>not taken</div>`;
        slot.classList.remove("taken");
        markStep(photosTaken.length, "active");
        document.getElementById("capture-btn").textContent = "📸 Take Photo";
        document.getElementById("capture-btn").onclick     = takePhoto;
        document.getElementById("main-title").textContent  = `TAKE PHOTO ${photosTaken.length+1}`;
      };
      return;
    }

    isAnalysing      = false;
    currentMoves     = data.solution.trim().split(/\s+/).filter(Boolean);
    currentFaceDesc  = data.face_desc || "";

    markStep(3, "done");
    document.getElementById("main-title").textContent = "SOLUTION READY";
    document.getElementById("main-desc").textContent  = "Follow the moves below on the 3D cube. If the solution is wrong, tap Report.";
    showBanner(`✅ Solution found — ${currentMoves.length} moves!`);

    showSolution();

  } catch (err) {
    clearTimeout(timeout);
    showBanner("⚠️ " + (err.name === "AbortError" ? "Request timed out." : err.message), "error");
    isAnalysing = false;
    document.getElementById("capture-btn").style.display = "block";
  }
}

// ── SHOW SOLUTION ─────────────────────────────────────────
function showSolution() {
  const algStr = currentMoves.join(" ");

  document.getElementById("move-count").textContent = currentMoves.length + " moves";

  // Render move chips
  const wrap = document.getElementById("moves-wrap");
  wrap.innerHTML = "";

  const chipsDiv = document.createElement("div");
  chipsDiv.className = "chips-container";
  currentMoves.forEach(m => {
    const chip = document.createElement("span");
    chip.className   = "move-chip";
    chip.textContent = m;
    chipsDiv.appendChild(chip);
  });
  wrap.appendChild(chipsDiv);

  // Report wrong solution button
  const reportBtn = document.createElement("button");
  reportBtn.className = "btn btn-report";
  reportBtn.textContent = "⚠ This solution is wrong — report it";
  reportBtn.onclick = reportWrongSolution;
  wrap.appendChild(reportBtn);

  // Apply to twisty
  const twisty = document.getElementById("twisty");
  twisty.setAttribute("alg", algStr);
  document.getElementById("twisty-wrap").style.display = "block";

  document.getElementById("solution-area").style.display = "block";
  document.getElementById("solution-area").scrollIntoView({ behavior: "smooth" });
}

// ── REPORT WRONG SOLUTION ─────────────────────────────────
async function reportWrongSolution() {
  const btn = document.querySelector(".btn-report");
  if (btn) { btn.disabled = true; btn.textContent = "Reporting..."; }

  try {
    await fetch("/report-error", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        face_desc:  currentFaceDesc,
        solution:   currentMoves.join(" "),
        error_type: "wrong_solution",
        lesson:     "The solution produced did not solve the cube. Gemini must re-examine its reasoning about centre identification, edge pairing, and parity handling for 4x4 cubes."
      })
    });
    if (btn) { btn.textContent = "✅ Reported — Gemini will learn from this"; }
    showBanner("Thanks! This mistake has been logged. Gemini will do better next time.", "info");
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "⚠ This solution is wrong — report it"; }
  }
}

// ── RESTART ───────────────────────────────────────────────
function doRestart() {
  photosTaken     = [];
  currentMoves    = [];
  currentFaceDesc = "";
  isAnalysing     = false;

  for (let i = 0; i < 4; i++) {
    const slot = document.getElementById(`slot-${i}`);
    slot.innerHTML = `<div class="photo-slot-empty">Photo ${i+1}<br>not taken</div>`;
    slot.classList.remove("taken");
    markStep(i, i === 0 ? "active" : "");
  }

  document.getElementById("shot-num").textContent        = "1";
  document.getElementById("main-title").textContent      = "TAKE PHOTO 1";
  document.getElementById("main-desc").textContent       = "Point your camera at the front of the cube. Make sure at least 3 faces are clearly visible.";
  document.getElementById("capture-btn").style.display   = "block";
  document.getElementById("capture-btn").textContent     = "📸 Take Photo";
  document.getElementById("capture-btn").onclick         = takePhoto;
  document.getElementById("restart-btn").style.display   = "none";
  document.getElementById("solution-area").style.display = "none";
  document.getElementById("status-banner").style.display = "none";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── HELPERS ───────────────────────────────────────────────
function markStep(index, state) {
  const el = document.getElementById(`step-${index}`);
  if (!el) return;
  el.classList.remove("active","done");
  if (state) el.classList.add(state);
}

function showBanner(msg, type = "info") {
  const b = document.getElementById("status-banner");
  if (!b) return;
  b.style.display     = "block";
  b.style.background  = type === "error" ? "rgba(255,77,77,0.08)"  : "rgba(200,241,53,0.07)";
  b.style.borderColor = type === "error" ? "rgba(255,77,77,0.2)"   : "rgba(200,241,53,0.2)";
  b.style.color       = type === "error" ? "#ff9090"                : "var(--accent)";
  b.textContent       = msg;
}
