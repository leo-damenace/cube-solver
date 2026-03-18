// ═══════════════════════════════════════════════════
//  CubeSolve — script.js
//  Camera · Color detection · cubing.js solver
// ═══════════════════════════════════════════════════

const FACE_NAMES  = ["White (Top)", "Green (Front)", "Red (Right)", "Blue (Back)", "Orange (Left)", "Yellow (Bottom)"];
const FACE_SHORT  = ["Top", "Front", "Right", "Back", "Left", "Bottom"];

// Maps our face order (U F R B L D) to cubing.js order (U R F D L B)
// Our index:    0=U  1=F  2=R  3=B  4=L  5=D
// cubing order: U    R    F    D    L    B
const CUBING_ORDER     = ["U","R","F","D","L","B"];
const OUR_IDX_FOR_FACE = { U:0, R:2, F:1, D:5, L:4, B:3 };

// Standard colour → cubing.js face letter (solved-cube orientation)
const COLOR_TO_FACE = {
  white:  "U",
  red:    "R",
  green:  "F",
  yellow: "D",
  orange: "L",
  blue:   "B",
};

// Cube colour definitions for math-based detection
const CUBE_COLORS = {
  white:  { r:245, g:245, b:245, hex:"#f5f5f5" },
  yellow: { r:255, g:210, b:  0, hex:"#ffd200" },
  red:    { r:210, g: 25, b: 25, hex:"#d21919" },
  orange: { r:255, g:100, b:  0, hex:"#ff6400" },
  blue:   { r:  0, g: 70, b:200, hex:"#0046c8" },
  green:  { r:  0, g:155, b: 45, hex:"#009b2d" },
};

// ── STATE ────────────────────────────────────────────────
let currentFace = 0;
let faceColors  = [];   // array of 6 arrays, each with 16 colour names

// ── DOM refs ─────────────────────────────────────────────
const gateEl      = document.getElementById("gate");
const appEl       = document.getElementById("app");
const codeInput   = document.getElementById("code-input");
const enterBtn    = document.getElementById("enter-btn");
const gateError   = document.getElementById("gate-error");
const video       = document.getElementById("camera");
const overlay     = document.getElementById("overlay");
const ctx         = overlay.getContext("2d");
const captureBtn  = document.getElementById("capture-btn");
const solveRow    = document.getElementById("solve-row");
const solveBtn    = document.getElementById("solve-btn");
const resetBtn    = document.getElementById("reset-btn");
const solutionArea= document.getElementById("solution-area");
const facesRow    = document.getElementById("faces-row");
const faceNameEl  = document.getElementById("face-name");
const faceNumEl   = document.getElementById("face-num");
const mainTitle   = document.getElementById("main-title");
const mainDesc    = document.getElementById("main-desc");

// ── INVITE GATE ──────────────────────────────────────────
async function checkCode() {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;

  enterBtn.disabled = true;
  enterBtn.innerHTML = '<span class="spinner"></span> Checking...';

  try {
    const res  = await fetch("/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await res.json();

    if (data.valid) {
      gateEl.style.display = "none";
      appEl.style.display  = "block";
      startCamera();
    } else {
      gateError.textContent = "Invalid code — check with whoever sent it to you.";
      codeInput.classList.add("shake");
      codeInput.addEventListener("animationend", () => codeInput.classList.remove("shake"), { once: true });
      enterBtn.disabled = false;
      enterBtn.textContent = "Enter";
    }
  } catch {
    gateError.textContent = "Network error — try again.";
    enterBtn.disabled = false;
    enterBtn.textContent = "Enter";
  }
}

enterBtn.addEventListener("click", checkCode);
codeInput.addEventListener("keydown", e => { if (e.key === "Enter") checkCode(); });
codeInput.addEventListener("input",   ()  => { gateError.textContent = ""; });

// ── CAMERA ───────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width:{ ideal:1280 }, height:{ ideal:960 } }
    });
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", () => {
      overlay.width  = video.videoWidth  || video.clientWidth;
      overlay.height = video.videoHeight || video.clientHeight;
      drawGrid();
    });
  } catch {
    alert("Camera access denied. Please allow camera permissions and reload.");
  }
}

// ── GRID OVERLAY ─────────────────────────────────────────
function drawGrid() {
  const w = overlay.width, h = overlay.height;
  const size  = Math.min(w, h) * 0.56;
  const sx    = (w - size) / 2;
  const sy    = (h - size) / 2;
  const cell  = size / 4;

  ctx.clearRect(0, 0, w, h);

  // Vignette outside grid
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(0, 0, w, h);
  ctx.clearRect(sx, sy, size, size);

  // Corner accents
  const corner = 18;
  ctx.strokeStyle = "#c8f135";
  ctx.lineWidth   = 3;
  ctx.lineCap     = "round";

  const corners = [
    [sx, sy, 1, 1], [sx+size, sy, -1, 1],
    [sx, sy+size, 1, -1], [sx+size, sy+size, -1, -1]
  ];
  corners.forEach(([x, y, dx, dy]) => {
    ctx.beginPath(); ctx.moveTo(x + dx*corner, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy*corner); ctx.stroke();
  });

  // Inner grid lines
  ctx.strokeStyle = "rgba(200,241,53,0.35)";
  ctx.lineWidth   = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(sx + i*cell, sy); ctx.lineTo(sx + i*cell, sy+size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy + i*cell); ctx.lineTo(sx+size, sy + i*cell); ctx.stroke();
  }

  requestAnimationFrame(drawGrid);
}

// ── COLOR DETECTION ──────────────────────────────────────
function closestColor(r, g, b) {
  let best = null, bestDist = Infinity;
  for (const [name, col] of Object.entries(CUBE_COLORS)) {
    const d = Math.sqrt((r-col.r)**2 + (g-col.g)**2 + (b-col.b)**2);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

function captureFaceColors() {
  const snap = document.createElement("canvas");
  snap.width  = video.videoWidth  || 640;
  snap.height = video.videoHeight || 480;
  snap.getContext("2d").drawImage(video, 0, 0);

  const w = snap.width, h = snap.height;
  const size = Math.min(w,h) * 0.56;
  const sx   = (w - size) / 2;
  const sy   = (h - size) / 2;
  const cell = size / 4;
  const sCtx = snap.getContext("2d");

  const colors = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const px = Math.floor(sx + col*cell + cell*0.5);
      const py = Math.floor(sy + row*cell + cell*0.5);
      const [r,g,b] = sCtx.getImageData(px, py, 1, 1).data;
      colors.push(closestColor(r, g, b));
    }
  }
  return colors;
}

// ── CAPTURE ──────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  const colors = captureFaceColors();
  faceColors[currentFace] = colors;

  // Update sidebar step
  const steps = document.querySelectorAll(".face-step");
  steps[currentFace].classList.remove("active");
  steps[currentFace].classList.add("done");

  addFaceThumb(currentFace, colors);
  currentFace++;
  faceNumEl.textContent = currentFace;

  if (currentFace < 6) {
    steps[currentFace].classList.add("active");
    faceNameEl.textContent  = FACE_NAMES[currentFace];
    mainTitle.textContent   = `SCAN FACE ${currentFace+1} OF 6`;
    mainDesc.innerHTML      = `Hold the <strong>${FACE_NAMES[currentFace]}</strong> face up to the camera so the stickers fill the grid, then press Capture.`;
  } else {
    captureBtn.disabled     = true;
    captureBtn.textContent  = "✅  All faces captured!";
    solveRow.style.display  = "flex";
    resetBtn.style.display  = "block";
    mainTitle.textContent   = "READY TO SOLVE";
    mainDesc.textContent    = "All 6 faces scanned. Press Solve to get the solution.";
    faceNameEl.textContent  = "—";
  }
});

// ── FACE THUMBNAILS ──────────────────────────────────────
function addFaceThumb(index, colors) {
  // Remove placeholder slot if present
  const existing = facesRow.querySelectorAll(".face-thumb");
  if (existing[index]) existing[index].remove();

  const slots = facesRow.querySelectorAll(".face-slot");
  if (slots[index]) slots[index].remove();

  const wrap = document.createElement("div");
  wrap.className = "face-thumb";

  const grid = document.createElement("div");
  grid.className = "mini-grid";
  colors.forEach(c => {
    const cell = document.createElement("div");
    cell.className = "mini-cell";
    cell.style.background = CUBE_COLORS[c].hex;
    grid.appendChild(cell);
  });

  const lbl = document.createElement("div");
  lbl.className   = "face-thumb-label";
  lbl.textContent = FACE_SHORT[index];

  wrap.appendChild(grid);
  wrap.appendChild(lbl);
  facesRow.appendChild(wrap);
}

// Initialise empty slots
function initSlots() {
  facesRow.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const slot = document.createElement("div");
    slot.className = "face-slot";
    slot.innerHTML = `<span class="face-slot-icon">◻</span>`;
    facesRow.appendChild(slot);
  }
}
initSlots();

// ── SOLVE ─────────────────────────────────────────────────
solveBtn.addEventListener("click", async () => {
  solveBtn.innerHTML = '<span class="spinner"></span> Solving...';
  solveBtn.disabled  = true;

  // Build 96-char state string for cubing.js: U R F D L B order
  let stateStr = "";
  for (const letter of CUBING_ORDER) {
    const ourIdx = OUR_IDX_FOR_FACE[letter];
    for (const colorName of faceColors[ourIdx]) {
      stateStr += COLOR_TO_FACE[colorName];
    }
  }

  try {
    const { experimental4x4x4Solve } = await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution = await experimental4x4x4Solve(stateStr);
    showSolution(solution.toString());
  } catch (err) {
    console.error(err);
    solutionArea.style.display = "block";
    document.getElementById("moves-wrap").innerHTML = "";
    document.getElementById("twisty-wrap").style.display = "none";
    document.getElementById("move-count").textContent = "";

    const errBox = document.createElement("div");
    errBox.className = "error-box";
    errBox.innerHTML = `
      <strong>Could not solve — colours may have been misread.</strong><br><br>
      Try again with:<br>
      · Bright, even lighting (no shadows)<br>
      · Cube held flat and centred in the grid<br>
      · No glare on the stickers<br><br>
      Press ↺ Reset and scan again.
    `;
    document.getElementById("moves-wrap").appendChild(errBox);

    solveBtn.innerHTML = "✅  Solve the Cube!";
    solveBtn.disabled  = false;
  }
});

function showSolution(algString) {
  const moves = algString.trim().split(/\s+/).filter(Boolean);

  document.getElementById("move-count").textContent = `${moves.length} moves`;

  const wrap = document.getElementById("moves-wrap");
  wrap.innerHTML = "";
  moves.forEach(m => {
    const chip = document.createElement("span");
    chip.className   = "move-chip";
    chip.textContent = m;
    wrap.appendChild(chip);
  });

  const twisty = document.getElementById("twisty");
  twisty.setAttribute("alg", algString);
  document.getElementById("twisty-wrap").style.display = "block";

  solutionArea.style.display = "block";
  solutionArea.scrollIntoView({ behavior: "smooth" });
}

// ── RESET ─────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  currentFace = 0;
  faceColors  = [];

  document.querySelectorAll(".face-step").forEach((s,i) => {
    s.classList.remove("active","done");
    if (i === 0) s.classList.add("active");
  });

  faceNameEl.textContent  = FACE_NAMES[0];
  faceNumEl.textContent   = "0";
  mainTitle.textContent   = "SCAN FACE 1 OF 6";
  mainDesc.innerHTML      = `Hold the <strong>White (Top)</strong> face up to the camera, then press Capture.`;

  captureBtn.disabled     = false;
  captureBtn.textContent  = "📸 \u00a0Capture Face";

  solveRow.style.display  = "none";
  solutionArea.style.display = "none";
  resetBtn.style.display  = "none";

  solveBtn.innerHTML = "✅ \u00a0Solve the Cube!";
  solveBtn.disabled  = false;

  document.getElementById("twisty-wrap").style.display = "block";
  document.getElementById("move-count").textContent = "";

  initSlots();
});
