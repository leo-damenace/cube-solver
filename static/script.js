// ═══════════════════════════════════════════════════════
//  CubeSolve — script.js
//  Supabase Google Auth · 4-photo Gemini scanning
//  Colour editor · cubing.js 4x4 solver
// ═══════════════════════════════════════════════════════

// ── COLOURS ──────────────────────────────────────────────
const COLOURS = {
  white:  { hex: "#f0f0f0", label: "White"  },
  yellow: { hex: "#ffd200", label: "Yellow" },
  red:    { hex: "#c41e1e", label: "Red"    },
  orange: { hex: "#ff6400", label: "Orange" },
  blue:   { hex: "#0046c8", label: "Blue"   },
  green:  { hex: "#009b2d", label: "Green"  },
};
const COLOUR_NAMES = ["white","yellow","red","orange","blue","green"];

// cubing.js face mapping
// Standard orientation: U=white, D=yellow, F=green, B=blue, L=orange, R=red
const COLOR_TO_FACE = { white:"U", yellow:"D", green:"F", blue:"B", orange:"L", red:"R" };
const CUBING_ORDER  = ["U","R","F","D","L","B"];
const FACE_IDX      = { U:0, D:1, F:2, B:3, L:4, R:5 };
const FACE_LABELS   = { U:"Top", D:"Bottom", F:"Front", B:"Back", L:"Left", R:"Right" };

// ── MOVE EXPLANATIONS ─────────────────────────────────────
const MOVE_EXP = {
  "U":   {n:"U — Top CW",        w:"Rotate top layer 90° clockwise.",              y:"Repositions top layer pieces without touching lower layers."},
  "U'":  {n:"U' — Top CCW",      w:"Rotate top layer 90° counter-clockwise.",      y:"Undoes a U move."},
  "U2":  {n:"U2 — Top 180°",     w:"Rotate top layer 180°.",                       y:"Swaps opposite top pieces."},
  "D":   {n:"D — Bottom CW",     w:"Rotate bottom layer 90° clockwise.",           y:"Moves bottom pieces without disturbing the top."},
  "D'":  {n:"D' — Bottom CCW",   w:"Rotate bottom layer 90° counter-clockwise.",   y:"Undoes a D move."},
  "D2":  {n:"D2 — Bottom 180°",  w:"Rotate bottom layer 180°.",                    y:"Swaps opposite bottom pieces."},
  "R":   {n:"R — Right CW",      w:"Rotate right face 90° clockwise.",             y:"Shifts pieces between top, front, bottom and back on the right."},
  "R'":  {n:"R' — Right CCW",    w:"Rotate right face 90° counter-clockwise.",     y:"Undoes an R move."},
  "R2":  {n:"R2 — Right 180°",   w:"Rotate right face 180°.",                      y:"Swaps right face pieces."},
  "L":   {n:"L — Left CW",       w:"Rotate left face 90° clockwise.",              y:"Mirrors R on the left side."},
  "L'":  {n:"L' — Left CCW",     w:"Rotate left face 90° counter-clockwise.",      y:"Undoes an L move."},
  "L2":  {n:"L2 — Left 180°",    w:"Rotate left face 180°.",                       y:"Swaps left face pieces."},
  "F":   {n:"F — Front CW",      w:"Rotate front face 90° clockwise.",             y:"Moves front side pieces."},
  "F'":  {n:"F' — Front CCW",    w:"Rotate front face 90° counter-clockwise.",     y:"Undoes an F move."},
  "F2":  {n:"F2 — Front 180°",   w:"Rotate front face 180°.",                      y:"Swaps front face pieces."},
  "B":   {n:"B — Back CW",       w:"Rotate back face 90° clockwise.",              y:"Like F but on the back."},
  "B'":  {n:"B' — Back CCW",     w:"Rotate back face 90° counter-clockwise.",      y:"Undoes a B move."},
  "B2":  {n:"B2 — Back 180°",    w:"Rotate back face 180°.",                       y:"Swaps back face pieces."},
  "Uw":  {n:"Uw — Wide Top CW",  w:"Rotate top TWO layers 90° clockwise.",         y:"4×4 specific — fixes inner edge parity."},
  "Uw'": {n:"Uw' — Wide Top CCW",w:"Rotate top TWO layers counter-clockwise.",     y:"Undoes a Uw move."},
  "Uw2": {n:"Uw2 — Wide Top 180°",w:"Rotate top TWO layers 180°.",                 y:"Swaps inner edges the top can't fix alone."},
  "Dw":  {n:"Dw — Wide Bottom CW",w:"Rotate bottom TWO layers 90° clockwise.",     y:"Repositions inner bottom edges."},
  "Dw'": {n:"Dw' — Wide Bottom CCW",w:"Rotate bottom TWO layers counter-clockwise.",y:"Undoes a Dw move."},
  "Dw2": {n:"Dw2 — Wide Bottom 180°",w:"Rotate bottom TWO layers 180°.",            y:"Fixes inner bottom edges."},
  "Rw":  {n:"Rw — Wide Right CW", w:"Rotate right TWO layers 90° clockwise.",      y:"Key for solving 4×4 centres."},
  "Rw'": {n:"Rw' — Wide Right CCW",w:"Rotate right TWO layers counter-clockwise.", y:"Undoes an Rw move."},
  "Rw2": {n:"Rw2 — Wide Right 180°",w:"Rotate right TWO layers 180°.",              y:"Swaps inner right slice pieces."},
  "Lw":  {n:"Lw — Wide Left CW",  w:"Rotate left TWO layers 90° clockwise.",       y:"Mirrors Rw on the left."},
  "Lw'": {n:"Lw' — Wide Left CCW",w:"Rotate left TWO layers counter-clockwise.",   y:"Undoes an Lw move."},
  "Lw2": {n:"Lw2 — Wide Left 180°",w:"Rotate left TWO layers 180°.",               y:"Swaps inner left pieces."},
  "Fw":  {n:"Fw — Wide Front CW", w:"Rotate front TWO layers 90° clockwise.",      y:"Moves inner front edges."},
  "Fw'": {n:"Fw' — Wide Front CCW",w:"Rotate front TWO layers counter-clockwise.", y:"Undoes an Fw move."},
  "Fw2": {n:"Fw2 — Wide Front 180°",w:"Rotate front TWO layers 180°.",              y:"Swaps inner front pieces."},
  "Bw":  {n:"Bw — Wide Back CW",  w:"Rotate back TWO layers 90° clockwise.",       y:"Moves inner back edges."},
  "Bw'": {n:"Bw' — Wide Back CCW",w:"Rotate back TWO layers counter-clockwise.",   y:"Undoes a Bw move."},
  "Bw2": {n:"Bw2 — Wide Back 180°",w:"Rotate back TWO layers 180°.",               y:"Swaps inner back pieces."},
};

function explainMove(m) {
  return MOVE_EXP[m] || { n: m, w: "Perform the " + m + " move.", y: "Part of the solving algorithm." };
}

// ── STATE ─────────────────────────────────────────────────
let supabase      = null;
let currentUser   = null;
let photosTaken   = [];          // array of base64 strings (up to 4)
let faceColors    = {};          // { U:[16], D:[16], F:[16], B:[16], L:[16], R:[16] }
let isAnalysing   = false;
let activePaint   = COLOUR_NAMES[0];

// ── INIT SUPABASE ─────────────────────────────────────────
window.addEventListener("load", () => {
  supabase = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  // Check if user is already signed in
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      showApp(data.session.user);
    }
  });

  // Listen for auth state changes (e.g. after OAuth redirect)
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      showApp(session.user);
    } else {
      showAuth();
    }
  });
});

// ── GOOGLE SIGN IN ────────────────────────────────────────
document.getElementById("google-btn").onclick = async () => {
  const btn = document.getElementById("google-btn");
  btn.disabled = true;
  btn.textContent = "Signing in...";

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });

  if (error) {
    document.getElementById("auth-error").textContent = error.message;
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Sign in with Google`;
  }
};

// ── SIGN OUT ──────────────────────────────────────────────
async function signOut() {
  await supabase.auth.signOut();
  showAuth();
  doRestart();
}

// ── SHOW AUTH / APP ───────────────────────────────────────
function showAuth() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app").style.display = "none";
  currentUser = null;
}

function showApp(user) {
  currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "block";

  // Set user info in sidebar
  const name   = user.user_metadata?.full_name || user.email || "User";
  const avatar = user.user_metadata?.avatar_url;
  document.getElementById("user-name").textContent = name;
  const avatarEl = document.getElementById("user-avatar");
  if (avatar) {
    avatarEl.innerHTML = `<img src="${avatar}" alt="${name}"/>`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  startCamera();
}

// ── CAMERA ────────────────────────────────────────────────
async function startCamera() {
  const video = document.getElementById("camera");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    video.srcObject = stream;
    video.play();
  } catch (err) {
    showBanner("Camera error: " + err.message + ". Go to Settings > Safari > Camera > Allow.", "error");
  }
}

// ── TAKE PHOTO ────────────────────────────────────────────
function takePhoto() {
  if (isAnalysing) return;
  const video = document.getElementById("camera");
  const count = photosTaken.length;
  if (count >= 4) return;

  // Capture + compress
  const snap  = document.createElement("canvas");
  const maxW  = 800;
  const scale = Math.min(1, maxW / (video.videoWidth || 1280));
  snap.width  = Math.floor((video.videoWidth  || 1280) * scale);
  snap.height = Math.floor((video.videoHeight || 720)  * scale);
  snap.getContext("2d").drawImage(video, 0, 0, snap.width, snap.height);
  const b64 = snap.toDataURL("image/jpeg", 0.82).split(",")[1];

  photosTaken.push(b64);

  // Show preview
  const slot = document.getElementById(`slot-${count}`);
  slot.innerHTML = `<img src="data:image/jpeg;base64,${b64}"/><div class="photo-slot-label">Photo ${count+1}</div>`;
  slot.classList.add("taken");

  // Update step
  markStep(count, "done");

  if (photosTaken.length < 4) {
    markStep(photosTaken.length, "active");
    document.getElementById("shot-num").textContent  = photosTaken.length + 1;
    document.getElementById("main-title").textContent = `TAKE PHOTO ${photosTaken.length + 1}`;
    const descs = [
      "Point at the front of the cube so 3 faces are visible.",
      "Rotate the cube and point at the back so the other faces show.",
      "Tilt the cube to show the top face clearly.",
      "Flip the cube to show the bottom face."
    ];
    document.getElementById("main-desc").textContent = descs[photosTaken.length] || "Make sure all faces have been captured.";
    showBanner(`✅ Photo ${count+1} saved! ${4 - photosTaken.length} more to go.`);
  } else {
    // All 4 taken — send to Gemini
    document.getElementById("capture-btn").style.display = "none";
    document.getElementById("restart-btn").style.display = "block";
    document.getElementById("main-title").textContent    = "ANALYSING...";
    document.getElementById("main-desc").textContent     = "Sending photos to Gemini for color recognition...";
    analysePhotos();
  }
}

// ── SEND TO GEMINI ────────────────────────────────────────
async function analysePhotos() {
  isAnalysing = true;
  showBanner("🤖 Gemini is reading all 6 faces from your photos...");

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 90000);

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
        document.getElementById("capture-btn").onclick = takePhoto;
        document.getElementById("main-title").textContent = `TAKE PHOTO ${photosTaken.length+1}`;
      };
      return;
    }

    // Store face colours
    faceColors = {};
    for (const [face, colours] of Object.entries(data.faces)) {
      faceColors[face] = colours.map(c => c.toLowerCase().trim());
    }

    isAnalysing = false;
    markStep(3, "done");
    document.getElementById("main-title").textContent = "ALL FACES SCANNED";
    document.getElementById("main-desc").innerHTML    = "Gemini read all 6 faces. Fix any wrong colours if needed, then press Solve.";
    showBanner("✅ All 6 faces identified! Review colours or press Solve.");
    document.getElementById("action-row").style.display = "flex";

  } catch (err) {
    clearTimeout(timeout);
    showBanner("⚠️ " + (err.name === "AbortError" ? "Request timed out. Try again." : err.message), "error");
    isAnalysing = false;
    document.getElementById("capture-btn").style.display = "block";
  }
}

// ── SOLVE ─────────────────────────────────────────────────
async function solveCube() {
  const btn = document.getElementById("solve-btn");
  btn.innerHTML = '<span class="spinner"></span> Solving...';
  btn.disabled  = true;

  // Build 96-char state string: U R F D L B
  let stateStr = "";
  for (const letter of CUBING_ORDER) {
    const face = faceColors[letter];
    if (!face) { stateStr += "U".repeat(16); continue; }
    for (const c of face) stateStr += (COLOR_TO_FACE[c] || "U");
  }

  try {
    // Using the dedicated cubing.js 4x4x4 solver
    const { experimental4x4x4Solve } = await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution = await experimental4x4x4Solve(stateStr);
    showSolution(solution.toString());
  } catch (err) {
    console.error(err);
    document.getElementById("solution-area").style.display = "block";
    document.getElementById("moves-wrap").innerHTML = `
      <div class="error-box">
        <strong>Could not solve.</strong> The cube state looks invalid.<br><br>
        Press <strong>Fix Colours</strong> to correct any wrong stickers. Make sure each colour appears exactly 16 times across all 6 faces.
      </div>`;
    btn.innerHTML = "✅ Solve!";
    btn.disabled  = false;
  }
}

function showSolution(algStr) {
  const moves = algStr.trim().split(/\s+/).filter(Boolean);
  document.getElementById("move-count").textContent = moves.length + " moves";

  const wrap = document.getElementById("moves-wrap");
  wrap.innerHTML = `<p style="font-size:.78rem;color:#555;margin-bottom:.8rem;">Tap any move to see what it does.</p>`;

  const chips = document.createElement("div");
  chips.style.marginBottom = "0.8rem";

  const panel = document.getElementById("explain-panel");
  let activeChip = null;

  moves.forEach((m, i) => {
    const chip = document.createElement("span");
    chip.className   = "move-chip";
    chip.textContent = m;
    const activate = () => {
      if (activeChip) activeChip.classList.remove("active");
      chip.classList.add("active");
      activeChip = chip;
      renderExplanation(m, i, moves.length);
    };
    chip.addEventListener("click", activate);
    chip.addEventListener("touchend", e => { e.preventDefault(); activate(); });
    chips.appendChild(chip);
  });

  wrap.appendChild(chips);

  // Auto-show first move
  chips.firstChild && chips.firstChild.classList.add("active");
  activeChip = chips.firstChild;
  renderExplanation(moves[0], 0, moves.length);

  document.getElementById("twisty").setAttribute("alg", algStr);
  document.getElementById("twisty-wrap").style.display   = "block";
  document.getElementById("solution-area").style.display = "block";
  document.getElementById("solution-area").scrollIntoView({ behavior: "smooth" });
}

function renderExplanation(move, index, total) {
  const info  = explainMove(move);
  const panel = document.getElementById("explain-panel");
  panel.style.display = "block";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
      <span style="font-family:'DM Mono',monospace;font-size:1.1rem;color:var(--accent);font-weight:500;">${move}</span>
      <span style="font-size:.7rem;color:#555;letter-spacing:1px;">MOVE ${index+1} OF ${total}</span>
    </div>
    <div style="font-size:.75rem;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:.4rem;">${info.n}</div>
    <div style="font-size:.88rem;color:var(--text);margin-bottom:.4rem;line-height:1.5;">🔄 ${info.w}</div>
    <div style="font-size:.82rem;color:var(--muted);line-height:1.5;">💡 <em>${info.y}</em></div>
  `;
}

// ── COLOUR EDITOR ─────────────────────────────────────────
function openEditor() {
  const container = document.getElementById("editor-faces");
  container.innerHTML = "";
  activePaint = COLOUR_NAMES[0];

  const faceOrder = ["U","D","F","B","L","R"];
  faceOrder.forEach(face => {
    const colours = faceColors[face] || Array(16).fill("white");
    const section = document.createElement("div");
    section.className = "editor-face";

    const lbl = document.createElement("div");
    lbl.className   = "editor-face-label";
    lbl.textContent = FACE_LABELS[face] + " face (" + face + ")";
    section.appendChild(lbl);

    const grid = document.createElement("div");
    grid.className = "editor-grid";

    colours.forEach((c, i) => {
      const cell = document.createElement("div");
      cell.className    = "editor-cell";
      cell.style.background = COLOURS[c]?.hex || "#333";
      const paint = () => {
        faceColors[face][i] = activePaint;
        cell.style.background = COLOURS[activePaint].hex;
        cell.classList.add("active");
        setTimeout(() => cell.classList.remove("active"), 250);
      };
      cell.addEventListener("click", paint);
      cell.addEventListener("touchend", e => { e.preventDefault(); paint(); });
      grid.appendChild(cell);
    });
    section.appendChild(grid);

    // Palette
    const palette = document.createElement("div");
    palette.className = "palette";
    COLOUR_NAMES.forEach(name => {
      const sw = document.createElement("div");
      sw.className = "swatch" + (name === activePaint ? " active" : "");
      sw.style.background = COLOURS[name].hex;
      sw.textContent = COLOURS[name].label;
      sw.dataset.colour = name;
      sw.addEventListener("click", () => {
        activePaint = name;
        document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("active", s.dataset.colour === name));
      });
      palette.appendChild(sw);
    });
    section.appendChild(palette);
    container.appendChild(section);
  });

  document.getElementById("editor-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeEditor() {
  document.getElementById("editor-modal").classList.remove("open");
  document.body.style.overflow = "";
}

function saveEditor() {
  closeEditor();
}

// ── RESTART ───────────────────────────────────────────────
function doRestart() {
  photosTaken = [];
  faceColors  = {};
  isAnalysing = false;
  activePaint = COLOUR_NAMES[0];

  // Reset slots
  for (let i = 0; i < 4; i++) {
    const slot = document.getElementById(`slot-${i}`);
    slot.innerHTML = `<div class="photo-slot-empty">Photo ${i+1}<br>not taken</div>`;
    slot.classList.remove("taken");
    markStep(i, i === 0 ? "active" : "");
  }

  document.getElementById("shot-num").textContent      = "1";
  document.getElementById("main-title").textContent    = "TAKE PHOTO 1";
  document.getElementById("main-desc").textContent     = "Point your camera at the front of the cube. Make sure at least 3 faces are clearly visible.";
  document.getElementById("capture-btn").style.display = "block";
  document.getElementById("capture-btn").textContent   = "📸 Take Photo";
  document.getElementById("capture-btn").onclick       = takePhoto;
  document.getElementById("restart-btn").style.display = "none";
  document.getElementById("action-row").style.display  = "none";
  document.getElementById("solution-area").style.display = "none";

  const solveBtn = document.getElementById("solve-btn");
  solveBtn.innerHTML = "✅ Solve!";
  solveBtn.disabled  = false;

  document.getElementById("status-banner").style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── HELPERS ───────────────────────────────────────────────
function markStep(index, state) {
  const el = document.getElementById(`step-${index}`);
  if (!el) return;
  el.classList.remove("active", "done");
  if (state) el.classList.add(state);
}

function showBanner(msg, type = "info") {
  const b = document.getElementById("status-banner");
  if (!b) return;
  b.style.display     = "block";
  b.style.background  = type === "error" ? "rgba(255,77,77,0.08)"   : "rgba(200,241,53,0.07)";
  b.style.borderColor = type === "error" ? "rgba(255,77,77,0.2)"    : "rgba(200,241,53,0.2)";
  b.style.color       = type === "error" ? "#ff9090"                 : "var(--accent)";
  b.textContent       = msg;
}
     
