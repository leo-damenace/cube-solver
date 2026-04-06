// ═══════════════════════════════════════════════════════
//  CubeSolve — script.js
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

// Canonical solver orientation: U=white D=yellow F=green B=blue R=red L=orange
let COLOR_TO_FACE = { white:"U", yellow:"D", green:"F", blue:"B", red:"R", orange:"L" };
const CUBING_ORDER = ["U","R","F","D","L","B"];
const FACE_LABELS  = { U:"Top", D:"Bottom", F:"Front", B:"Back", L:"Left", R:"Right" };

// ── MOVE EXPLANATIONS ─────────────────────────────────────
const MOVE_EXP = {
  "U":   {n:"U — Top CW",         w:"Rotate top layer 90° clockwise.",             y:"Moves top layer pieces."},
  "U'":  {n:"U' — Top CCW",       w:"Rotate top layer 90° counter-clockwise.",     y:"Undoes a U move."},
  "U2":  {n:"U2 — Top 180°",      w:"Rotate top layer 180°.",                      y:"Swaps opposite top pieces."},
  "D":   {n:"D — Bottom CW",      w:"Rotate bottom layer 90° clockwise.",          y:"Moves bottom pieces."},
  "D'":  {n:"D' — Bottom CCW",    w:"Rotate bottom layer 90° counter-clockwise.",  y:"Undoes a D move."},
  "D2":  {n:"D2 — Bottom 180°",   w:"Rotate bottom layer 180°.",                   y:"Swaps opposite bottom pieces."},
  "R":   {n:"R — Right CW",       w:"Rotate right face 90° clockwise.",            y:"Shifts right column pieces."},
  "R'":  {n:"R' — Right CCW",     w:"Rotate right face 90° counter-clockwise.",    y:"Undoes an R move."},
  "R2":  {n:"R2 — Right 180°",    w:"Rotate right face 180°.",                     y:"Swaps right face pieces."},
  "L":   {n:"L — Left CW",        w:"Rotate left face 90° clockwise.",             y:"Mirrors R on the left."},
  "L'":  {n:"L' — Left CCW",      w:"Rotate left face 90° counter-clockwise.",     y:"Undoes an L move."},
  "L2":  {n:"L2 — Left 180°",     w:"Rotate left face 180°.",                      y:"Swaps left face pieces."},
  "F":   {n:"F — Front CW",       w:"Rotate front face 90° clockwise.",            y:"Moves front side pieces."},
  "F'":  {n:"F' — Front CCW",     w:"Rotate front face 90° counter-clockwise.",    y:"Undoes an F move."},
  "F2":  {n:"F2 — Front 180°",    w:"Rotate front face 180°.",                     y:"Swaps front face pieces."},
  "B":   {n:"B — Back CW",        w:"Rotate back face 90° clockwise.",             y:"Like F but on the back."},
  "B'":  {n:"B' — Back CCW",      w:"Rotate back face 90° counter-clockwise.",     y:"Undoes a B move."},
  "B2":  {n:"B2 — Back 180°",     w:"Rotate back face 180°.",                      y:"Swaps back face pieces."},
  "Uw":  {n:"Uw — Wide Top CW",   w:"Rotate top TWO layers 90° clockwise.",        y:"4×4 wide move."},
  "Uw'": {n:"Uw' — Wide Top CCW", w:"Rotate top TWO layers counter-clockwise.",    y:"Undoes Uw."},
  "Uw2": {n:"Uw2 — Wide Top 180°",w:"Rotate top TWO layers 180°.",                 y:"4×4 wide move."},
  "Dw":  {n:"Dw — Wide Bot CW",   w:"Rotate bottom TWO layers 90° clockwise.",     y:"4×4 wide move."},
  "Dw'": {n:"Dw' — Wide Bot CCW", w:"Rotate bottom TWO layers counter-clockwise.", y:"Undoes Dw."},
  "Dw2": {n:"Dw2 — Wide Bot 180°",w:"Rotate bottom TWO layers 180°.",              y:"4×4 wide move."},
  "Rw":  {n:"Rw — Wide R CW",     w:"Rotate right TWO layers 90° clockwise.",      y:"4×4 wide move."},
  "Rw'": {n:"Rw' — Wide R CCW",   w:"Rotate right TWO layers counter-clockwise.",  y:"Undoes Rw."},
  "Rw2": {n:"Rw2 — Wide R 180°",  w:"Rotate right TWO layers 180°.",               y:"4×4 wide move."},
  "Lw":  {n:"Lw — Wide L CW",     w:"Rotate left TWO layers 90° clockwise.",       y:"4×4 wide move."},
  "Lw'": {n:"Lw' — Wide L CCW",   w:"Rotate left TWO layers counter-clockwise.",   y:"Undoes Lw."},
  "Lw2": {n:"Lw2 — Wide L 180°",  w:"Rotate left TWO layers 180°.",                y:"4×4 wide move."},
  "Fw":  {n:"Fw — Wide F CW",     w:"Rotate front TWO layers 90° clockwise.",      y:"4×4 wide move."},
  "Fw'": {n:"Fw' — Wide F CCW",   w:"Rotate front TWO layers counter-clockwise.",  y:"Undoes Fw."},
  "Fw2": {n:"Fw2 — Wide F 180°",  w:"Rotate front TWO layers 180°.",               y:"4×4 wide move."},
  "Bw":  {n:"Bw — Wide B CW",     w:"Rotate back TWO layers 90° clockwise.",       y:"4×4 wide move."},
  "Bw'": {n:"Bw' — Wide B CCW",   w:"Rotate back TWO layers counter-clockwise.",   y:"Undoes Bw."},
  "Bw2": {n:"Bw2 — Wide B 180°",  w:"Rotate back TWO layers 180°.",                y:"4×4 wide move."},
};
function explainMove(m) {
  return MOVE_EXP[m] || { n:m, w:"Perform the "+m+" move.", y:"Part of the solve." };
}

// ── STATE ─────────────────────────────────────────────────
let supabaseClient = null;
let currentUser    = null;
let photosTaken    = [];
let faceColors     = {};
let isAnalysing    = false;
let activePaint    = COLOUR_NAMES[0];
let currentMode    = "camera";

// ── INIT ──────────────────────────────────────────────────
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
    else showAuth();
  });
});

// ── GOOGLE SIGN IN ────────────────────────────────────────
document.getElementById("google-btn").onclick = async () => {
  const btn = document.getElementById("google-btn");
  btn.disabled = true; btn.textContent = "Signing in...";
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
  if (error) {
    document.getElementById("auth-error").textContent = error.message;
    btn.disabled = false; btn.textContent = "Sign in with Google";
  }
};

async function signOut() {
  await supabaseClient.auth.signOut();
  showAuth(); doRestart();
}

function showAuth() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app").style.display = "none";
  currentUser = null;
}

function showApp(user) {
  currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
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
  initManualCube();
}

// ── MODE SWITCHER ─────────────────────────────────────────
function setMode(mode) {
  currentMode = mode;
  document.getElementById("camera-mode").style.display = mode === "camera" ? "block" : "none";
  document.getElementById("manual-mode").style.display  = mode === "manual" ? "block" : "none";
  document.getElementById("mode-camera-btn").classList.toggle("active", mode === "camera");
  document.getElementById("mode-manual-btn").classList.toggle("active",  mode === "manual");
  document.getElementById("solution-area").style.display = "none";
  document.getElementById("status-banner").style.display = "none";

  // Update sidebar tips
  const tip = document.querySelector(".sidebar-tip strong");
  const tipBody = document.querySelector(".sidebar-tip");
  if (mode === "manual") {
    tip.textContent = "Manual mode";
    tipBody.lastChild.textContent = " Drag to rotate the cube. Tap a sticker then pick a colour to paint it. All 96 stickers must be set before solving.";
  } else {
    tip.textContent = "Camera mode";
    tipBody.lastChild.textContent = " Photo 1 & 2: opposite corners (each shows 3 faces). Photo 3 & 4: two side faces straight-on.";
  }
}

// ── CAMERA ────────────────────────────────────────────────
async function startCamera() {
  const video = document.getElementById("camera");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream; video.play();
  } catch (err) {
    showBanner("Camera error: " + err.message, "error");
  }
}

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

  const descs = [
    "Now rotate the cube to the OPPOSITE corner and take Photo 2.",
    "Now point the camera straight at one SIDE face (not top or bottom) for Photo 3.",
    "Now point at the other SIDE face for Photo 4."
  ];

  if (photosTaken.length < 4) {
    markStep(photosTaken.length, "active");
    document.getElementById("shot-num").textContent = photosTaken.length + 1;
    document.getElementById("main-title").textContent = `TAKE PHOTO ${photosTaken.length + 1}`;
    document.getElementById("main-desc").textContent = descs[photosTaken.length - 1] || "";
    showBanner(`✅ Photo ${count+1} saved! ${4 - photosTaken.length} more to go.`);
  } else {
    document.getElementById("capture-btn").style.display = "none";
    document.getElementById("restart-btn").style.display = "block";
    document.getElementById("main-title").textContent = "ANALYSING...";
    document.getElementById("main-desc").textContent  = "Gemini is reading all 6 faces...";
    analysePhotos();
  }
}

// ── SEND TO GEMINI ────────────────────────────────────────
async function analysePhotos() {
  isAnalysing = true;
  showBanner("🤖 Sending to Gemini...");
  try {
    const res  = await fetch("/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: photosTaken })
    });
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

    faceColors = {};
    for (const [face, colours] of Object.entries(data.faces)) {
      faceColors[face] = colours.map(c => c.toLowerCase().trim());
    }

    // Rebuild COLOR_TO_FACE from Gemini's orientation if provided
    if (data.orientation) {
      COLOR_TO_FACE = {};
      for (const [face, colour] of Object.entries(data.orientation)) {
        COLOR_TO_FACE[colour.toLowerCase().trim()] = face;
      }
    }

    isAnalysing = false;
    markStep(3, "done");
    document.getElementById("main-title").textContent = "ALL FACES SCANNED";
    document.getElementById("main-desc").textContent  = "Check colours look right then press Solve.";

    const counts = {};
    for (const face of CUBING_ORDER) for (const c of (faceColors[face]||[])) counts[c]=(counts[c]||0)+1;
    const wrong = Object.entries(counts).filter(([,n])=>n!==16);
    if (wrong.length) {
      showBanner("⚠️ Colour counts off: " + wrong.map(([c,n])=>`${c}=${n}`).join(", ") + " — fix before solving.", "error");
    } else {
      showBanner("✅ All 6 colours read correctly. Press Solve!");
    }
    document.getElementById("action-row").style.display = "flex";

  } catch (err) {
    showBanner("⚠️ " + err.message, "error");
    isAnalysing = false;
    document.getElementById("capture-btn").style.display = "block";
  }
}

// ══════════════════════════════════════════════════════════
//  MANUAL MODE — 3D ROTATING CUBE
// ══════════════════════════════════════════════════════════

let manualPaintColour = "white";
let cubeState = {}; // { U:[16], R:[16], F:[16], D:[16], L:[16], B:[16] }
let rotX = 0.5, rotY = -0.6;
let isDragging = false, lastX = 0, lastY = 0;
let hoveredSticker = null;

const FACE_COLOURS_DEFAULT = {
  U: "white", R: "red", F: "green", D: "yellow", L: "orange", B: "blue"
};

const COLOUR_HEX = {
  white:"#f0f0f0", yellow:"#ffd200", red:"#c41e1e",
  orange:"#ff6400", blue:"#0046c8", green:"#009b2d", none:"#222"
};

function initManualCube() {
  cubeState = {};
  for (const face of CUBING_ORDER) {
    cubeState[face] = Array(16).fill("none");
  }
  setupCubeCanvas();
  drawCube();
}

function resetManualCube() {
  initManualCube();
  document.getElementById("solution-area").style.display = "none";
  showBanner("Cube reset. Tap stickers to set colours.");
}

function setPaintColour(colour) {
  manualPaintColour = colour;
  document.querySelectorAll(".palette-swatch").forEach(s => {
    s.classList.toggle("active", s.dataset.colour === colour);
  });
}

function setupCubeCanvas() {
  const canvas = document.getElementById("cube-canvas");
  const wrap   = document.getElementById("cube-canvas-wrap");
  canvas.width = wrap.clientWidth || 400;

  // Mouse events
  canvas.onmousedown  = e => { isDragging=true; lastX=e.clientX; lastY=e.clientY; };
  canvas.onmousemove  = e => {
    if (isDragging) {
      rotY += (e.clientX - lastX) * 0.01;
      rotX += (e.clientY - lastY) * 0.01;
      lastX=e.clientX; lastY=e.clientY; drawCube();
    } else {
      updateHover(e.clientX, e.clientY, canvas);
    }
  };
  canvas.onmouseup    = e => {
    if (!isDragging) return;
    isDragging = false;
  };
  canvas.onmouseleave = () => { isDragging=false; hoveredSticker=null; drawCube(); };
  canvas.onclick      = e => paintSticker(e.clientX, e.clientY, canvas);

  // Touch events
  canvas.ontouchstart = e => {
    e.preventDefault();
    const t = e.touches[0];
    isDragging=true; lastX=t.clientX; lastY=t.clientY;
  };
  canvas.ontouchmove = e => {
    e.preventDefault();
    const t = e.touches[0];
    if (isDragging) {
      rotY += (t.clientX - lastX) * 0.012;
      rotX += (t.clientY - lastY) * 0.012;
      lastX=t.clientX; lastY=t.clientY; drawCube();
    }
  };
  canvas.ontouchend = e => {
    e.preventDefault();
    if (e.changedTouches[0]) {
      const t = e.changedTouches[0];
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      if (Math.abs(dx)<5 && Math.abs(dy)<5) paintSticker(t.clientX, t.clientY, canvas);
    }
    isDragging = false;
  };
}

// 3D projection helpers
function project(x, y, z, canvas) {
  const cos = Math.cos, sin = Math.sin;
  // Rotate around Y axis
  let x1 = x*cos(rotY) + z*sin(rotY);
  let z1 = -x*sin(rotY) + z*cos(rotY);
  // Rotate around X axis
  let y1 = y*cos(rotX) - z1*sin(rotX);
  let z2 = y*sin(rotX) + z1*cos(rotX);
  // Perspective projection
  const fov = 4;
  const scale = fov / (fov + z2 + 2);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  return { x: cx + x1 * scale * canvas.width * 0.35, y: cy + y1 * scale * canvas.width * 0.35, z: z2 };
}

// Each face is defined by its 16 sticker positions
// Face definitions: [faceKey, normalX, normalY, normalZ, rightX, rightY, rightZ, upX, upY, upZ]
const FACE_DEFS = [
  { face:"F", nx:0, ny:0, nz:1,  rx:1, ry:0, rz:0,  ux:0, uy:-1, uz:0 },
  { face:"B", nx:0, ny:0, nz:-1, rx:-1,ry:0, rz:0,  ux:0, uy:-1, uz:0 },
  { face:"U", nx:0, ny:-1,nz:0,  rx:1, ry:0, rz:0,  ux:0, uy:0,  uz:1 },
  { face:"D", nx:0, ny:1, nz:0,  rx:1, ry:0, rz:0,  ux:0, uy:0,  uz:-1},
  { face:"R", nx:1, ny:0, nz:0,  rx:0, ry:0, rz:-1, ux:0, uy:-1, uz:0 },
  { face:"L", nx:-1,ny:0, nz:0,  rx:0, ry:0, rz:1,  ux:0, uy:-1, uz:0 },
];

let stickerHitboxes = [];

function drawCube() {
  const canvas = document.getElementById("cube-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const size = 0.9; // cube half-size
  const gap  = 0.03;
  const s    = (size * 2) / 4; // sticker size

  stickerHitboxes = [];

  // Sort faces by depth (painter's algorithm)
  const facesWithDepth = FACE_DEFS.map(fd => {
    const cp = project(fd.nx * size, fd.ny * size, fd.nz * size, canvas);
    return { ...fd, depth: cp.z };
  }).sort((a, b) => a.depth - b.depth);

  for (const fd of facesWithDepth) {
    // Only draw faces facing toward camera
    const cp = project(fd.nx * size, fd.ny * size, fd.nz * size, canvas);
    const origin = project(0, 0, 0, canvas);
    // Dot product check: if face normal dot view direction > 0 face is visible
    const cos = Math.cos, sin = Math.sin;
    let nx = fd.nx * cos(rotY) + fd.nz * sin(rotY);
    let nz2 = -fd.nx * sin(rotY) + fd.nz * cos(rotY);
    let ny = fd.ny * cos(rotX) - nz2 * sin(rotX);
    let nz3 = fd.ny * sin(rotX) + nz2 * cos(rotX);
    if (nz3 < 0.1) continue; // back face culling

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const idx = row * 4 + col;
        // Center of this sticker in 3D
        const cx3 = fd.nx * size + fd.rx * (-size + s/2 + gap/2 + col * (s + gap)) + fd.ux * (-size + s/2 + gap/2 + row * (s + gap));
        const cy3 = fd.ny * size + fd.ry * (-size + s/2 + gap/2 + col * (s + gap)) + fd.uy * (-size + s/2 + gap/2 + row * (s + gap));
        const cz3 = fd.nz * size + fd.rz * (-size + s/2 + gap/2 + col * (s + gap)) + fd.uz * (-size + s/2 + gap/2 + row * (s + gap));

        // 4 corners of this sticker
        const hs = s / 2 - gap;
        const corners = [
          [-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]
        ].map(([du, dv]) => {
          const px = cx3 + fd.rx * du + fd.ux * dv;
          const py = cy3 + fd.ry * du + fd.uy * dv;
          const pz = cz3 + fd.rz * du + fd.uz * dv;
          return project(px, py, pz, canvas);
        });

        const colour = (cubeState[fd.face] || [])[idx] || "none";
        const isHovered = hoveredSticker && hoveredSticker.face === fd.face && hoveredSticker.idx === idx;

        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();

        ctx.fillStyle = COLOUR_HEX[colour] || "#222";
        ctx.fill();

        if (isHovered) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.strokeStyle = "rgba(0,0,0,0.4)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Store hitbox for click detection (use bounding box of projected corners)
        const xs = corners.map(c=>c.x), ys = corners.map(c=>c.y);
        stickerHitboxes.push({
          face: fd.face, idx,
          minX: Math.min(...xs), maxX: Math.max(...xs),
          minY: Math.min(...ys), maxY: Math.max(...ys),
          corners, depth: fd.depth
        });
      }
    }
  }
}

function getStickerAt(clientX, clientY, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  // Find topmost (highest depth) sticker under cursor
  let best = null;
  for (const h of stickerHitboxes) {
    if (x >= h.minX && x <= h.maxX && y >= h.minY && y <= h.maxY) {
      if (!best || h.depth > best.depth) best = h;
    }
  }
  return best;
}

function updateHover(clientX, clientY, canvas) {
  const h = getStickerAt(clientX, clientY, canvas);
  const prev = hoveredSticker;
  hoveredSticker = h ? { face: h.face, idx: h.idx } : null;
  if (JSON.stringify(prev) !== JSON.stringify(hoveredSticker)) drawCube();
}

function paintSticker(clientX, clientY, canvas) {
  const h = getStickerAt(clientX, clientY, canvas);
  if (!h) return;
  if (!cubeState[h.face]) cubeState[h.face] = Array(16).fill("none");
  cubeState[h.face][h.idx] = manualPaintColour;
  drawCube();
}

// ── SOLVE ─────────────────────────────────────────────────
async function solveCube() {
  // In manual mode, use cubeState; in camera mode use faceColors
  const source = currentMode === "manual" ? cubeState : faceColors;

  const btn = document.getElementById(currentMode === "manual" ? "manual-solve-btn" : "solve-btn");
  btn.innerHTML = '<span class="spinner"></span> Solving...';
  btn.disabled  = true;

  // Build 96-char reid state string (order: U R F D L B)
  let stateStr = "";
  for (const letter of CUBING_ORDER) {
    const face = source[letter];
    if (!face || face.length !== 16) {
      showSolveError(`Face ${letter} is incomplete. Make sure all stickers are set.`);
      btn.innerHTML = currentMode === "manual" ? "✅ Solve!" : "✅ Solve!";
      btn.disabled = false; return;
    }
    for (const c of face) {
      const mapped = COLOR_TO_FACE[c];
      if (!mapped) {
        showSolveError(`Unknown colour "${c}" on face ${letter}.`);
        btn.innerHTML = "✅ Solve!"; btn.disabled = false; return;
      }
      stateStr += mapped;
    }
  }

  // Validate counts
  const counts = {};
  for (const ch of stateStr) counts[ch] = (counts[ch]||0)+1;
  const wrong = Object.entries(counts).filter(([,n])=>n!==16);
  if (wrong.length) {
    showSolveError("Each colour must appear exactly 16 times. Off: " + wrong.map(([f,n])=>`${f}=${n}/16`).join(", "));
    btn.innerHTML = "✅ Solve!"; btn.disabled = false; return;
  }

  try {
    const { experimental4x4x4Solve } = await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution = await experimental4x4x4Solve(stateStr);
    const algStr   = solution.toString().trim();
    const twisty   = document.getElementById("twisty");
    twisty.setAttribute("experimental-setup-alg", invertAlg(algStr));
    twisty.setAttribute("alg", algStr);
    showSolution(algStr);
  } catch (err) {
    showSolveError(
      "Solver rejected this state.<br>" +
      "State string: <code style='font-size:.65rem;word-break:break-all;color:#aaa'>" + stateStr + "</code><br><br>" +
      (currentMode === "camera" ? "Press <strong>Fix Colours</strong> to correct any wrong stickers." : "Check that every sticker colour is correct.")
    );
    btn.innerHTML = "✅ Solve!"; btn.disabled = false;
  }
}

function invertAlg(algStr) {
  return algStr.trim().split(/\s+/).reverse().map(m => {
    if (m.endsWith("2")) return m;
    if (m.endsWith("'")) return m.slice(0,-1);
    return m + "'";
  }).join(" ");
}

function showSolveError(html) {
  document.getElementById("solution-area").style.display = "block";
  document.getElementById("twisty-wrap").style.display   = "none";
  document.getElementById("moves-wrap").innerHTML = `<div class="error-box"><strong>Could not solve.</strong><br><br>${html}</div>`;
}

// ── SHOW SOLUTION ─────────────────────────────────────────
function showSolution(algStr) {
  const moves = algStr.trim().split(/\s+/).filter(Boolean);
  document.getElementById("move-count").textContent = moves.length + " moves";

  const wrap = document.getElementById("moves-wrap");
  wrap.innerHTML = `<p style="font-size:.78rem;color:#555;margin-bottom:.8rem;">Tap any move to see what it does.</p>`;

  const chips = document.createElement("div");
  chips.style.marginBottom = "0.8rem";
  let activeChip = null;

  moves.forEach((m, i) => {
    const chip = document.createElement("span");
    chip.className = "move-chip"; chip.textContent = m;
    const activate = () => {
      if (activeChip) activeChip.classList.remove("active");
      chip.classList.add("active"); activeChip = chip;
      renderExplanation(m, i, moves.length);
    };
    chip.addEventListener("click", activate);
    chip.addEventListener("touchend", e => { e.preventDefault(); activate(); });
    chips.appendChild(chip);
  });

  wrap.appendChild(chips);
  chips.firstChild && chips.firstChild.classList.add("active");
  activeChip = chips.firstChild;
  renderExplanation(moves[0], 0, moves.length);

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

// ── COLOUR EDITOR (camera mode) ───────────────────────────
function openEditor() {
  const container = document.getElementById("editor-faces");
  container.innerHTML = "";
  activePaint = COLOUR_NAMES[0];

  ["U","D","F","B","L","R"].forEach(face => {
    const colours = faceColors[face] || Array(16).fill("white");
    const section = document.createElement("div");
    section.className = "editor-face";
    const lbl = document.createElement("div");
    lbl.className = "editor-face-label";
    lbl.textContent = FACE_LABELS[face] + " face (" + face + ")";
    section.appendChild(lbl);
    const grid = document.createElement("div");
    grid.className = "editor-grid";
    colours.forEach((c, i) => {
      const cell = document.createElement("div");
      cell.className = "editor-cell";
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

function saveEditor() { closeEditor(); }

// ── RESTART ───────────────────────────────────────────────
function doRestart() {
  photosTaken = []; faceColors = {}; isAnalysing = false;
  for (let i = 0; i < 4; i++) {
    const slot = document.getElementById(`slot-${i}`);
    slot.innerHTML = `<div class="photo-slot-empty">Photo ${i+1}<br>not taken</div>`;
    slot.classList.remove("taken");
    markStep(i, i === 0 ? "active" : "");
  }
  document.getElementById("shot-num").textContent      = "1";
  document.getElementById("main-title").textContent    = "TAKE PHOTO 1";
  document.getElementById("main-desc").textContent     = "Point at the front-top corner of the cube so 3 faces are visible.";
  document.getElementById("capture-btn").style.display = "block";
  document.getElementById("capture-btn").textContent   = "📸 Take Photo";
  document.getElementById("capture-btn").onclick       = takePhoto;
  document.getElementById("restart-btn").style.display = "none";
  document.getElementById("action-row").style.display  = "none";
  document.getElementById("solution-area").style.display = "none";
  document.getElementById("status-banner").style.display = "none";
  document.getElementById("solve-btn").innerHTML = "✅ Solve!";
  document.getElementById("solve-btn").disabled  = false;
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
