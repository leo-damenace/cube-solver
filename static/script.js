// ═══════════════════════════════════════════════════════
//  CubeSolve — script.js
// ═══════════════════════════════════════════════════════

// ── MOVE EXPLANATIONS ─────────────────────────────────────
const MOVE_EXP = {
  "U":    {n:"U — Top CW",            w:"Rotate top layer 90° clockwise.",              y:"Repositions top layer pieces without touching lower layers."},
  "U'":   {n:"U' — Top CCW",          w:"Rotate top layer 90° counter-clockwise.",      y:"Undoes a U move."},
  "U2":   {n:"U2 — Top 180°",         w:"Rotate top layer 180°.",                       y:"Swaps opposite top pieces."},
  "D":    {n:"D — Bottom CW",         w:"Rotate bottom layer 90° clockwise.",           y:"Moves bottom pieces without disturbing the top."},
  "D'":   {n:"D' — Bottom CCW",       w:"Rotate bottom layer 90° counter-clockwise.",   y:"Undoes a D move."},
  "D2":   {n:"D2 — Bottom 180°",      w:"Rotate bottom layer 180°.",                    y:"Swaps opposite bottom pieces."},
  "R":    {n:"R — Right CW",          w:"Rotate right face 90° clockwise.",             y:"Shifts pieces between top, front, bottom and back on the right."},
  "R'":   {n:"R' — Right CCW",        w:"Rotate right face 90° counter-clockwise.",     y:"Undoes an R move."},
  "R2":   {n:"R2 — Right 180°",       w:"Rotate right face 180°.",                      y:"Swaps right face pieces."},
  "L":    {n:"L — Left CW",           w:"Rotate left face 90° clockwise.",              y:"Mirrors R on the left side."},
  "L'":   {n:"L' — Left CCW",         w:"Rotate left face 90° counter-clockwise.",      y:"Undoes an L move."},
  "L2":   {n:"L2 — Left 180°",        w:"Rotate left face 180°.",                       y:"Swaps left face pieces."},
  "F":    {n:"F — Front CW",          w:"Rotate front face 90° clockwise.",             y:"Moves front side pieces."},
  "F'":   {n:"F' — Front CCW",        w:"Rotate front face 90° counter-clockwise.",     y:"Undoes an F move."},
  "F2":   {n:"F2 — Front 180°",       w:"Rotate front face 180°.",                      y:"Swaps front face pieces."},
  "B":    {n:"B — Back CW",           w:"Rotate back face 90° clockwise.",              y:"Like F but on the back."},
  "B'":   {n:"B' — Back CCW",         w:"Rotate back face 90° counter-clockwise.",      y:"Undoes a B move."},
  "B2":   {n:"B2 — Back 180°",        w:"Rotate back face 180°.",                       y:"Swaps back face pieces."},
  "Uw":   {n:"Uw — Wide Top CW",      w:"Rotate top TWO layers 90° clockwise.",         y:"4×4 specific — fixes inner edge parity."},
  "Uw'":  {n:"Uw' — Wide Top CCW",    w:"Rotate top TWO layers counter-clockwise.",     y:"Undoes a Uw move."},
  "Uw2":  {n:"Uw2 — Wide Top 180°",   w:"Rotate top TWO layers 180°.",                  y:"4×4 wide move."},
  "Dw":   {n:"Dw — Wide Bottom CW",   w:"Rotate bottom TWO layers 90° clockwise.",      y:"Repositions inner bottom edges."},
  "Dw'":  {n:"Dw' — Wide Bottom CCW", w:"Rotate bottom TWO layers counter-clockwise.",  y:"Undoes a Dw move."},
  "Dw2":  {n:"Dw2 — Wide Bottom 180°",w:"Rotate bottom TWO layers 180°.",               y:"Fixes inner bottom edges."},
  "Rw":   {n:"Rw — Wide Right CW",    w:"Rotate right TWO layers 90° clockwise.",       y:"Key for solving 4×4 centres."},
  "Rw'":  {n:"Rw' — Wide Right CCW",  w:"Rotate right TWO layers counter-clockwise.",   y:"Undoes an Rw move."},
  "Rw2":  {n:"Rw2 — Wide Right 180°", w:"Rotate right TWO layers 180°.",                y:"Swaps inner right slice pieces."},
  "Lw":   {n:"Lw — Wide Left CW",     w:"Rotate left TWO layers 90° clockwise.",        y:"Mirrors Rw on the left."},
  "Lw'":  {n:"Lw' — Wide Left CCW",   w:"Rotate left TWO layers counter-clockwise.",    y:"Undoes an Lw move."},
  "Lw2":  {n:"Lw2 — Wide Left 180°",  w:"Rotate left TWO layers 180°.",                 y:"Swaps inner left pieces."},
  "Fw":   {n:"Fw — Wide Front CW",    w:"Rotate front TWO layers 90° clockwise.",       y:"Moves inner front edges."},
  "Fw'":  {n:"Fw' — Wide Front CCW",  w:"Rotate front TWO layers counter-clockwise.",   y:"Undoes an Fw move."},
  "Fw2":  {n:"Fw2 — Wide Front 180°", w:"Rotate front TWO layers 180°.",                y:"Swaps inner front pieces."},
  "Bw":   {n:"Bw — Wide Back CW",     w:"Rotate back TWO layers 90° clockwise.",        y:"Moves inner back edges."},
  "Bw'":  {n:"Bw' — Wide Back CCW",   w:"Rotate back TWO layers counter-clockwise.",    y:"Undoes a Bw move."},
  "Bw2":  {n:"Bw2 — Wide Back 180°",  w:"Rotate back TWO layers 180°.",                 y:"Swaps inner back pieces."},
};

function explainMove(m) {
  return MOVE_EXP[m] || { n: m, w: "Perform the " + m + " move.", y: "Part of the solving algorithm." };
}

// ── STATE ─────────────────────────────────────────────────
let supabaseClient = null;
let currentUser    = null;
let photosTaken    = [];
let currentMoves   = [];   // array of move strings from Gemini
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
    document.getElementById("main-title").textContent    = "ANALYSING...";
    document.getElementById("main-desc").textContent     = "Gemini is solving your cube from the photos. This takes a few seconds.";
    analysePhotos();
  }
}

// ── SEND TO GEMINI ────────────────────────────────────────
async function analysePhotos() {
  isAnalysing = true;
  showBanner("🤖 Gemini is solving your cube...");

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 120000);

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

    isAnalysing    = false;
    currentMoves   = data.solution.trim().split(/\s+/).filter(Boolean);

    markStep(3, "done");
    document.getElementById("main-title").textContent = "SOLUTION READY";
    document.getElementById("main-desc").textContent  = "Gemini solved your cube. Review the moves below, edit if needed, then apply.";
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
  renderMoveEditor();
  applyToTwisty();

  document.getElementById("solution-area").style.display = "block";
  document.getElementById("solution-area").scrollIntoView({ behavior: "smooth" });
}

// ── MOVE EDITOR ───────────────────────────────────────────
function renderMoveEditor() {
  const wrap = document.getElementById("moves-wrap");
  wrap.innerHTML = `
    <p class="moves-hint">Tap any move chip to delete it · drag to reorder · or type below to add moves</p>
  `;

  const chipsDiv = document.createElement("div");
  chipsDiv.id        = "chips-container";
  chipsDiv.className = "chips-container";

  currentMoves.forEach((m, i) => {
    chipsDiv.appendChild(makeChip(m, i));
  });

  wrap.appendChild(chipsDiv);

  // Explain panel
  const panel = document.createElement("div");
  panel.id        = "explain-panel";
  panel.className = "explain-panel";
  panel.style.display = "none";
  wrap.appendChild(panel);

  // Manual add row
  const addRow = document.createElement("div");
  addRow.className = "add-move-row";
  addRow.innerHTML = `
    <input id="move-input" class="move-input" type="text" placeholder="Add move (e.g. Rw2)" maxlength="4" autocomplete="off" autocorrect="off"/>
    <button class="btn btn-ghost" style="flex:0;padding:.6rem 1rem;font-size:.85rem" onclick="addMove()">+ Add</button>
  `;
  wrap.appendChild(addRow);

  document.getElementById("move-input").addEventListener("keydown", e => {
    if (e.key === "Enter") addMove();
  });

  // Apply button
  const applyBtn = document.createElement("button");
  applyBtn.className   = "btn btn-success";
  applyBtn.style.width = "100%";
  applyBtn.style.marginTop = "0.8rem";
  applyBtn.innerHTML   = "▶ Apply to 3D Cube";
  applyBtn.onclick     = applyToTwisty;
  wrap.appendChild(applyBtn);
}

function makeChip(move, index) {
  const chip = document.createElement("span");
  chip.className    = "move-chip";
  chip.textContent  = move;
  chip.dataset.index = index;

  chip.addEventListener("click", () => {
    // Single tap = show explanation
    const info  = explainMove(move);
    const panel = document.getElementById("explain-panel");
    panel.style.display = "block";
    panel.innerHTML = `
      <div class="explain-top">
        <span class="explain-move">${move}</span>
        <button class="explain-delete" onclick="deleteMove(${index})">✕ Remove</button>
      </div>
      <div class="explain-name">${info.n}</div>
      <div class="explain-what">🔄 ${info.w}</div>
      <div class="explain-why">💡 <em>${info.y}</em></div>
    `;
    document.querySelectorAll(".move-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
  });

  chip.addEventListener("touchend", e => { e.preventDefault(); chip.click(); });

  return chip;
}

function deleteMove(index) {
  currentMoves.splice(index, 1);
  document.getElementById("explain-panel").style.display = "none";
  renderMoveEditor();
  applyToTwisty();
}

function addMove() {
  const input = document.getElementById("move-input");
  const val   = input.value.trim();
  if (!val) return;
  currentMoves.push(val);
  input.value = "";
  renderMoveEditor();
  applyToTwisty();
}

// ── APPLY TO TWISTY-PLAYER ────────────────────────────────
function applyToTwisty() {
  const algStr = currentMoves.join(" ");
  document.getElementById("move-count").textContent = currentMoves.length + " moves";

  const twisty = document.getElementById("twisty");
  twisty.setAttribute("alg", algStr);
  

  document.getElementById("twisty-wrap").style.display = "block";
}

// ── INVERT ALG ────────────────────────────────────────────
function invertAlg(algStr) {
  return algStr.trim().split(/\s+/).filter(Boolean).reverse().map(m => {
    if (m.endsWith("2"))  return m;
    if (m.endsWith("'"))  return m.slice(0, -1);
    return m + "'";
  }).join(" ");
}

// ── RESTART ───────────────────────────────────────────────
function doRestart() {
  photosTaken  = [];
  currentMoves = [];
  isAnalysing  = false;

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
