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

// ── GRID OVERLAY — Isometric 4×4 corner guide ────────────
function drawGrid() {
  const w = overlay.width, h = overlay.height;
  ctx.clearRect(0, 0, w, h);

  // ── Isometric corner guide parameters ──
  // The cube corner sits at the center of the frame.
  // Three faces fan out: Top (up), Right (bottom-right), Left (bottom-left).
  const cx = w / 2;
  const cy = h / 2;

  // Face size: each face is a parallelogram made of 4×4 cells
  const cellPx = Math.min(w, h) * 0.10;  // size of one sticker in px
  const N = 4;                             // 4×4 cube

  // Isometric axis vectors
  // right-axis (goes to the right face)
  const rx =  cellPx,     ry =  cellPx * 0.5;
  // left-axis (goes to the left face)
  const lx = -cellPx,     ly =  cellPx * 0.5;
  // up-axis (goes to the top face)
  const ux =  0,          uy = -cellPx;

  // The front corner (where all 3 faces meet) is at (cx, cy)
  // Top face: corner at (cx, cy), spans right and left axes upward
  // Right face: corner at (cx, cy), spans right axis down and up-axis down
  // Left face: corner at (cx, cy), spans left axis down and up-axis down

  const ACCENT  = "#c8f135";
  const GRID_C  = "rgba(200,241,53,0.5)";
  const FILL_T  = "rgba(200,241,53,0.04)";
  const FILL_R  = "rgba(200,241,53,0.03)";
  const FILL_L  = "rgba(200,241,53,0.02)";

  ctx.lineWidth = 1.5;
  ctx.lineCap   = "round";

  // Helper: point on face given (col, row) from corner
  // Top face: origin=cx,cy, col=right axis, row=left axis
  function topPt(c, r)   { return [cx + c*rx + r*lx + c*ux*0 + r*uy*0 - r*uy - c*uy, cy + c*ry + r*ly - r*uy - c*uy]; }
  // Actually let's define it cleanly per face:
  // Top face: origin at (cx,cy), u=right-axis, v=left-axis, but going "up" in iso
  //   point(c,r) = corner + c*(rx,ry-uy... 

  // Simpler direct approach:
  // Define the 4 outer corners of each face, then subdivide

  // Top face corners (the top face is a diamond/rhombus going up)
  // bottom-front = (cx, cy)
  // bottom-right = cx + N*rx, cy + N*ry
  // top          = cx + N*rx + N*lx, cy + N*ry + N*ly   (= cx, cy + N*ry+N*ly above due to symmetry... wait)
  // bottom-left  = cx + N*lx, cy + N*ly
  // Since rx=-lx, ry=ly:  top = (cx, cy + 2*N*ry) going up means top = (cx, cy - N*|uy|)
  // Let's just use ux/uy for the "up" direction on top face:
  // Top face: base corner at (cx,cy), right-vec=(rx,ry), back-vec=(lx,ly)
  // but the top face goes UP from (cx,cy):
  // Actually, in isometric:
  //   Top face: front-bottom=(cx,cy), right=(cx+N*rx, cy+N*ry), top=(cx+N*rx+N*lx, cy+N*ry+N*ly), left=(cx+N*lx, cy+N*ly)
  //   Right face: top-left=(cx,cy), top-right=(cx+N*rx,cy+N*ry), bot-right=(cx+N*rx,cy+N*ry+N*(-uy)), bot-left=(cx,cy+N*(-uy))
  //   Left face: top-right=(cx,cy), top-left=(cx+N*lx,cy+N*ly), bot-left=(cx+N*lx,cy+N*ly+N*(-uy)), bot-right=(cx,cy+N*(-uy))

  const duy = -uy; // positive down distance per cell on side faces

  // Face corner points
  // Top face
  const T_fr = [cx,            cy           ];
  const T_rr = [cx + N*rx,     cy + N*ry    ];
  const T_rb = [cx + N*rx+N*lx,cy + N*ry+N*ly];
  const T_lb = [cx + N*lx,     cy + N*ly    ];

  // Right face
  const R_tl = [cx,            cy           ];
  const R_tr = [cx + N*rx,     cy + N*ry    ];
  const R_br = [cx + N*rx,     cy + N*ry + N*duy];
  const R_bl = [cx,            cy + N*duy   ];

  // Left face
  const L_tr = [cx,            cy           ];
  const L_tl = [cx + N*lx,     cy + N*ly    ];
  const L_bl = [cx + N*lx,     cy + N*ly + N*duy];
  const L_br = [cx,            cy + N*duy   ];

  // Draw filled faces
  function drawFace(pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  drawFace([T_fr, T_rr, T_rb, T_lb], FILL_T);
  drawFace([R_tl, R_tr, R_br, R_bl], FILL_R);
  drawFace([L_tr, L_tl, L_bl, L_br], FILL_L);

  // Draw grid lines on each face
  ctx.strokeStyle = GRID_C;

  // Top face grid: lines along right-axis and left-axis
  for (let i = 0; i <= N; i++) {
    // lines parallel to left-axis
    const s = [cx + i*rx,      cy + i*ry     ];
    const e = [cx + i*rx+N*lx, cy + i*ry+N*ly];
    ctx.beginPath(); ctx.moveTo(s[0],s[1]); ctx.lineTo(e[0],e[1]); ctx.stroke();
    // lines parallel to right-axis
    const s2 = [cx + i*lx,     cy + i*ly     ];
    const e2  = [cx + i*lx+N*rx,cy + i*ly+N*ry];
    ctx.beginPath(); ctx.moveTo(s2[0],s2[1]); ctx.lineTo(e2[0],e2[1]); ctx.stroke();
  }

  // Right face grid: lines along right-axis and down-axis
  for (let i = 0; i <= N; i++) {
    // horizontal lines (along right-axis)
    const s = [cx,         cy + i*duy   ];
    const e = [cx + N*rx,  cy + N*ry + i*duy];
    ctx.beginPath(); ctx.moveTo(s[0],s[1]); ctx.lineTo(e[0],e[1]); ctx.stroke();
    // vertical lines (along down-axis)
    const s2 = [cx + i*rx, cy + i*ry   ];
    const e2  = [cx + i*rx, cy + i*ry + N*duy];
    ctx.beginPath(); ctx.moveTo(s2[0],s2[1]); ctx.lineTo(e2[0],e2[1]); ctx.stroke();
  }

  // Left face grid: lines along left-axis and down-axis
  for (let i = 0; i <= N; i++) {
    // horizontal lines (along left-axis)
    const s = [cx,         cy + i*duy   ];
    const e = [cx + N*lx,  cy + N*ly + i*duy];
    ctx.beginPath(); ctx.moveTo(s[0],s[1]); ctx.lineTo(e[0],e[1]); ctx.stroke();
    // vertical lines (along down-axis)
    const s2 = [cx + i*lx, cy + i*ly   ];
    const e2  = [cx + i*lx, cy + i*ly + N*duy];
    ctx.beginPath(); ctx.moveTo(s2[0],s2[1]); ctx.lineTo(e2[0],e2[1]); ctx.stroke();
  }

  // Draw bold outline edges of all 3 faces
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth   = 2.5;

  function strokePoly(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.closePath();
    ctx.stroke();
  }
  strokePoly([T_fr, T_rr, T_rb, T_lb]);
  strokePoly([R_tl, R_tr, R_br, R_bl]);
  strokePoly([L_tr, L_tl, L_bl, L_br]);

  // Center alignment dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI*2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(200,241,53,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

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
