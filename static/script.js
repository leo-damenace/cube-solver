// ═══════════════════════════════════════════════════
//  CubeSolve — script.js
//  Camera · Color detection · cubing.js solver
//  + Rotating 4×4 live preview cube
// ═══════════════════════════════════════════════════

const FACE_NAMES  = ["White (Top)", "Green (Front)", "Red (Right)", "Blue (Back)", "Orange (Left)", "Yellow (Bottom)"];
const FACE_SHORT  = ["Top", "Front", "Right", "Back", "Left", "Bottom"];

const CUBING_ORDER     = ["U","R","F","D","L","B"];
const OUR_IDX_FOR_FACE = { U:0, R:2, F:1, D:5, L:4, B:3 };

const COLOR_TO_FACE = {
  white:"U", red:"R", green:"F", yellow:"D", orange:"L", blue:"B"
};

const CUBE_COLORS = {
  white:  { r:245, g:245, b:245, hex:"#f5f5f5" },
  yellow: { r:255, g:210, b:  0, hex:"#ffd200" },
  red:    { r:210, g: 25, b: 25, hex:"#d21919" },
  orange: { r:255, g:100, b:  0, hex:"#ff6400" },
  blue:   { r:  0, g: 70, b:200, hex:"#0046c8" },
  green:  { r:  0, g:155, b: 45, hex:"#009b2d" },
};

const DEFAULT_HEX = "#2a2a2a";

// ── STATE ────────────────────────────────────────────────
let currentFace = 0;
let faceColors  = [];

// Per-face per-sticker hex colors for the live 3D preview
// faceHexGrid[faceIdx][row][col]
let faceHexGrid = Array.from({length:6}, () =>
  Array.from({length:4}, () => Array(4).fill(DEFAULT_HEX))
);

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
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.valid) {
      gateEl.style.display = "none";
      appEl.style.display  = "block";
      startCamera();
      startCubePreview();
    } else {
      gateError.textContent = "Invalid code — check with whoever sent it to you.";
      codeInput.classList.add("shake");
      codeInput.addEventListener("animationend", () => codeInput.classList.remove("shake"), {once:true});
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
codeInput.addEventListener("keydown", e => { if (e.key==="Enter") checkCode(); });
codeInput.addEventListener("input",   () => { gateError.textContent = ""; });

// ── CAMERA ───────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:"environment", width:{ideal:1280}, height:{ideal:960} }
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

// ══════════════════════════════════════════════════════════
//  GRID OVERLAY — isometric cube wireframe (individual sticker outlines)
// ══════════════════════════════════════════════════════════
function drawGrid() {
  const w = overlay.width, h = overlay.height;
  ctx.clearRect(0, 0, w, h);

  const N    = 4;
  const cell = Math.min(w, h) * 0.095;
  const cx   = w / 2;
  const cy   = h * 0.52;
  const dy   = cell;

  // Iso axes
  const rx = cell,  ry = cell * 0.5;   // right face axis →
  const lx = -cell, ly = cell * 0.5;   // left face axis ←

  // The 3 visible faces meet at the "front corner" at (cx, cy)
  // Top face spans UPWARD, side faces span DOWNWARD

  function topPt(c, r) {
    // origin = front-bottom of top face = (cx, cy)
    return [cx + c*rx + r*lx, cy + c*ry + r*ly - N*dy];
  }
  function rightPt(c, r) {
    // origin = top-left of right face = (cx, cy - N*dy + N*ry)? No.
    // Top face bottom-right corner = topPt(N, 0) = (cx+N*rx, cy+N*ry-N*dy)
    // Right face top-left = (cx, cy)  top-right = (cx+N*rx, cy+N*ry)
    return [cx + c*rx, cy - N*dy + N*ry*0 + c*ry + r*dy];
    // simplified: right face top at cy, grows down by r*dy, right by c*(rx,ry)
  }
  function leftPt(c, r) {
    return [cx + c*lx, cy + c*ly + r*dy];
  }

  // Fix: align top face bottom to the top of the side faces
  // Side faces top edge = cy (front corner)
  // Top face bottom-front corner = cy
  // So topPt(0,0) = (cx, cy - N*dy + 0) ... let me redo properly

  // Correct isometric layout:
  // Front corner (where all 3 faces meet) = (cx, cy)
  // Right face:  top-left=(cx,cy), top-right=(cx+N*rx, cy+N*ry), bottom-right=(cx+N*rx, cy+N*ry+N*dy), bottom-left=(cx, cy+N*dy)
  // Left face:   top-right=(cx,cy), top-left=(cx+N*lx, cy+N*ly), bottom-left=(cx+N*lx, cy+N*ly+N*dy), bottom-right=(cx, cy+N*dy)
  // Top face:    front-bottom=(cx,cy), right=(cx+N*rx, cy+N*ry), back=(cx+N*rx+N*lx, cy+N*ry+N*ly), left=(cx+N*lx, cy+N*ly)
  //   BUT the top face is on TOP of the cube — it should appear ABOVE.
  //   In standard iso, the top face goes upward (negative y screen).
  //   top face front-bottom corner = (cx, cy)
  //   but cell going "into" the top face moves in the -(uy) direction which is negative screen Y.
  //   So: going right on top = (rx, ry), going back on top = (lx, ly) but going UP
  //   Actually in proper iso top face: right=(rx,ry), back=(-rx,ry), so top apex = (cx, cy - N*ry*2)... hmm

  // Let's just use a clean 2-vec parameterisation:
  // Top face: u=(rx, ry-dy), v=(lx, ly-dy) ... no.
  // Reference: standard isometric cube, top face:
  //   going right = (cellSize, cellSize*0.5)
  //   going "back-left" = (-cellSize, cellSize*0.5)
  //   going "up" (from side faces to top) = (0, -cellSize)
  // Top face is the rhombus. Front point = (cx, cy).
  // right point = (cx + N*rx, cy + N*ry)
  // back point = (cx, cy - N*dy) ... wait that's only if ry=dy/2
  // With rx=cell, ry=cell*0.5, dy=cell:
  //   right = (cx+N*cell, cy+N*cell*0.5)
  //   left  = (cx-N*cell, cy+N*cell*0.5)
  //   top   = (cx, cy - N*cell) — but this is the top of the side panels height

  // Actually the front-corner of the TOP face should sit at cy, and going along u=(rx,ry) and v=(lx,ly)
  // gives us the rhombus. The apex (back corner) of the top face is at (cx, cy+N*ry+N*ly) = (cx, cy+N*cell) — that goes DOWN not up!
  // The issue: in screen coordinates, Y grows downward.
  // For the cube to look correct, the top face must go ABOVE (lower screen Y).
  // Standard fix: top face uses u=(rx,-ry), v=(lx,-ly), so going along the face moves upward.

  // FINAL CLEAN VERSION:
  const trx = rx, try_ = -ry;   // top-face right vector (goes up-right)
  const tlx = lx, tly_ = -ly;   // top-face left vector (goes up-left)

  function tp(c, r) { // top face point, origin at (cx, cy)
    return [cx + c*trx + r*tlx, cy + c*try_ + r*tly_];
  }
  function rp(c, r) { // right face point, origin at (cx, cy)
    return [cx + c*rx, cy + c*ry + r*dy];
  }
  function lp(c, r) { // left face point, origin at (cx, cy)
    return [cx + c*lx, cy + c*ly + r*dy];
  }

  const ACCENT = "#c8f135";
  const SCOLOR = "rgba(200,241,53,0.7)";

  function drawSticker(corners, sw, lw) {
    const inset = 0.13;
    const cx2 = corners.reduce((s,p)=>s+p[0],0)/4;
    const cy2 = corners.reduce((s,p)=>s+p[1],0)/4;
    const pts = corners.map(([x,y]) => [x+(cx2-x)*inset, y+(cy2-y)*inset]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i=1;i<4;i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.strokeStyle = sw;
    ctx.lineWidth = lw;
    ctx.stroke();
  }

  // Top face stickers
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
    drawSticker([tp(c,r), tp(c+1,r), tp(c+1,r+1), tp(c,r+1)], SCOLOR, 1.2);
  }
  // Right face stickers
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
    drawSticker([rp(c,r), rp(c+1,r), rp(c+1,r+1), rp(c,r+1)], SCOLOR, 1.2);
  }
  // Left face stickers
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
    drawSticker([lp(c,r), lp(c+1,r), lp(c+1,r+1), lp(c,r+1)], SCOLOR, 1.2);
  }

  // Bold outer edges
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = "round";
  ctx.lineCap     = "round";

  function strokeQuad(a,b,c,d) {
    ctx.beginPath();
    ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]);
    ctx.lineTo(c[0],c[1]); ctx.lineTo(d[0],d[1]);
    ctx.closePath(); ctx.stroke();
  }
  strokeQuad(tp(0,0), tp(N,0), tp(N,N), tp(0,N));
  strokeQuad(rp(0,0), rp(N,0), rp(N,N), rp(0,N));
  strokeQuad(lp(0,0), lp(N,0), lp(N,N), lp(0,N));

  // Center alignment dot at front corner
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2);
  ctx.fillStyle = ACCENT; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(200,241,53,0.35)"; ctx.lineWidth=1.5; ctx.stroke();

  requestAnimationFrame(drawGrid);
}

// ══════════════════════════════════════════════════════════
//  ROTATING 4×4 CUBE PREVIEW — updates live on capture
// ══════════════════════════════════════════════════════════
let cubeAngle = 0.4;

function startCubePreview() {
  const canvas = document.getElementById("ref-cube");
  if (!canvas) return;
  const rc = canvas.getContext("2d");
  function loop() {
    cubeAngle += 0.007;
    drawRotatingCube(rc, canvas.width, canvas.height, cubeAngle);
    requestAnimationFrame(loop);
  }
  loop();
}

function drawRotatingCube(rc, W, H, angle) {
  rc.clearRect(0, 0, W, H);

  const N     = 4;
  const scale = Math.min(W, H) * 0.155;
  const cx    = W * 0.5;
  const cy    = H * 0.52;
  const tiltX = 0.5;   // how much we look down at the cube
  const half  = N / 2;
  const INSET = 0.08;  // gap fraction between stickers

  function project(x, y, z) {
    // Rotate Y
    const x1 =  x*Math.cos(angle) + z*Math.sin(angle);
    const z1 = -x*Math.sin(angle) + z*Math.cos(angle);
    // Tilt X
    const y2 =  y*Math.cos(tiltX) - z1*Math.sin(tiltX);
    const z2 =  y*Math.sin(tiltX) + z1*Math.cos(tiltX);
    return { sx: cx + x1*scale, sy: cy - y2*scale, depth: z2 };
  }

  function isFaceVisible(nx, ny, nz) {
    // Rotate normal as we do the vertices
    const nx1 =  nx*Math.cos(angle) + nz*Math.sin(angle);
    const nz1 = -nx*Math.sin(angle) + nz*Math.cos(angle);
    const ny2 =  ny*Math.cos(tiltX) - nz1*Math.sin(tiltX);
    const nz2 =  ny*Math.sin(tiltX) + nz1*Math.cos(tiltX);
    return -nz2 > 0.04; // dot with view direction (0,0,-1)
  }

  // Build all sticker quads from all 6 faces
  const allQuads = [];

  const faceDefs = [
    { idx:0, nx:0,  ny:1,  nz:0,  // U top
      quad:(c,r)=>[
        project(-half+c,   +half, -half+r  ),
        project(-half+c+1, +half, -half+r  ),
        project(-half+c+1, +half, -half+r+1),
        project(-half+c,   +half, -half+r+1),
      ]
    },
    { idx:1, nx:0,  ny:0,  nz:1,  // F front
      quad:(c,r)=>[
        project(-half+c,   +half-r,   +half),
        project(-half+c+1, +half-r,   +half),
        project(-half+c+1, +half-r-1, +half),
        project(-half+c,   +half-r-1, +half),
      ]
    },
    { idx:2, nx:1,  ny:0,  nz:0,  // R right
      quad:(c,r)=>[
        project(+half, +half-r,   -half+c  ),
        project(+half, +half-r,   -half+c+1),
        project(+half, +half-r-1, -half+c+1),
        project(+half, +half-r-1, -half+c  ),
      ]
    },
    { idx:3, nx:0,  ny:0,  nz:-1, // B back
      quad:(c,r)=>[
        project(+half-c,   +half-r,   -half),
        project(+half-c-1, +half-r,   -half),
        project(+half-c-1, +half-r-1, -half),
        project(+half-c,   +half-r-1, -half),
      ]
    },
    { idx:4, nx:-1, ny:0,  nz:0,  // L left
      quad:(c,r)=>[
        project(-half, +half-r,   +half-c  ),
        project(-half, +half-r,   +half-c-1),
        project(-half, +half-r-1, +half-c-1),
        project(-half, +half-r-1, +half-c  ),
      ]
    },
    { idx:5, nx:0,  ny:-1, nz:0,  // D bottom
      quad:(c,r)=>[
        project(-half+c,   -half, +half-r  ),
        project(-half+c+1, -half, +half-r  ),
        project(-half+c+1, -half, +half-r-1),
        project(-half+c,   -half, +half-r-1),
      ]
    },
  ];

  for (const fd of faceDefs) {
    if (!isFaceVisible(fd.nx, fd.ny, fd.nz)) continue;
    for (let r=0; r<N; r++) {
      for (let c=0; c<N; c++) {
        const pts = fd.quad(c, r);
        const depth = pts.reduce((s,p)=>s+p.depth,0)/4;
        allQuads.push({ pts, depth, hex: faceHexGrid[fd.idx][r][c] });
      }
    }
  }

  // Sort far-to-near (painter's algorithm)
  allQuads.sort((a,b) => a.depth - b.depth);

  // Draw each sticker
  for (const { pts, hex } of allQuads) {
    const [p0,p1,p2,p3] = pts;

    // Black body behind sticker (full quad)
    rc.beginPath();
    rc.moveTo(p0.sx,p0.sy); rc.lineTo(p1.sx,p1.sy);
    rc.lineTo(p2.sx,p2.sy); rc.lineTo(p3.sx,p3.sy);
    rc.closePath();
    rc.fillStyle = "#0d0d0d";
    rc.fill();

    // Inset sticker
    const mcx = (p0.sx+p1.sx+p2.sx+p3.sx)/4;
    const mcy = (p0.sy+p1.sy+p2.sy+p3.sy)/4;
    function lerp(a, b, t) { return { sx:a.sx+(b.sx-a.sx)*t, sy:a.sy+(b.sy-a.sy)*t }; }
    const i0 = lerp(p0, {sx:mcx,sy:mcy}, INSET);
    const i1 = lerp(p1, {sx:mcx,sy:mcy}, INSET);
    const i2 = lerp(p2, {sx:mcx,sy:mcy}, INSET);
    const i3 = lerp(p3, {sx:mcx,sy:mcy}, INSET);

    rc.beginPath();
    rc.moveTo(i0.sx,i0.sy); rc.lineTo(i1.sx,i1.sy);
    rc.lineTo(i2.sx,i2.sy); rc.lineTo(i3.sx,i3.sy);
    rc.closePath();
    rc.fillStyle = hex;
    rc.fill();

    // Subtle white edge on colored stickers
    if (hex !== DEFAULT_HEX) {
      rc.strokeStyle = "rgba(255,255,255,0.18)";
      rc.lineWidth = 0.6;
      rc.stroke();
    }
  }
}

// Update 3D cube colors when a face is captured
function updateCubeColors(faceIdx, colors) {
  for (let r=0; r<4; r++) {
    for (let c=0; c<4; c++) {
      const name = colors[r*4+c];
      faceHexGrid[faceIdx][r][c] = CUBE_COLORS[name]?.hex || DEFAULT_HEX;
    }
  }
}

// ── COLOR DETECTION ──────────────────────────────────────
function closestColor(r, g, b) {
  let best=null, bestDist=Infinity;
  for (const [name,col] of Object.entries(CUBE_COLORS)) {
    const d = Math.sqrt((r-col.r)**2+(g-col.g)**2+(b-col.b)**2);
    if (d < bestDist) { bestDist=d; best=name; }
  }
  return best;
}

function captureFaceColors() {
  const snap = document.createElement("canvas");
  snap.width  = video.videoWidth  || 640;
  snap.height = video.videoHeight || 480;
  snap.getContext("2d").drawImage(video, 0, 0);

  const sw = snap.width, sh = snap.height;
  const N    = 4;
  const cell = Math.min(sw, sh) * 0.095;
  const cx   = sw / 2;
  const cy   = sh * 0.52;
  const rx   = cell,  ry = cell * 0.5;
  const lx   = -cell, ly = cell * 0.5;
  const sCtx = snap.getContext("2d");

  // Sample center of each top-face sticker cell
  function tp(c, r) {
    return [cx + c*rx + r*lx, cy + c*ry + r*(-ly)]; // mirrored Y for top face going up
  }

  const colors = [];
  for (let r=0; r<N; r++) {
    for (let c=0; c<N; c++) {
      const pts = [tp(c,r), tp(c+1,r), tp(c+1,r+1), tp(c,r+1)];
      const px  = Math.round(pts.reduce((s,p)=>s+p[0],0)/4);
      const py  = Math.round(pts.reduce((s,p)=>s+p[1],0)/4);
      const [rr,gg,bb] = sCtx.getImageData(
        Math.max(0,Math.min(px,sw-1)), Math.max(0,Math.min(py,sh-1)), 1, 1
      ).data;
      colors.push(closestColor(rr, gg, bb));
    }
  }
  return colors;
}

// ── CAPTURE ──────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  const colors = captureFaceColors();
  faceColors[currentFace] = colors;

  // Live update 3D cube
  updateCubeColors(currentFace, colors);

  const steps = document.querySelectorAll(".face-step");
  steps[currentFace].classList.remove("active");
  steps[currentFace].classList.add("done");

  addFaceThumb(currentFace, colors);
  currentFace++;
  faceNumEl.textContent = currentFace;

  if (currentFace < 6) {
    steps[currentFace].classList.add("active");
    faceNameEl.textContent = FACE_NAMES[currentFace];
    mainTitle.textContent  = `SCAN FACE ${currentFace+1} OF 6`;
    mainDesc.innerHTML     = `Hold the <strong>${FACE_NAMES[currentFace]}</strong> face up to the camera so the stickers fill the grid, then press Capture.`;
    const badge = document.getElementById("shot-badge");
    if (badge) badge.textContent = `PHOTO ${currentFace+1} OF 6`;
  } else {
    captureBtn.disabled    = true;
    captureBtn.textContent = "✅  All faces captured!";
    solveRow.style.display = "flex";
    resetBtn.style.display = "block";
    mainTitle.textContent  = "READY TO SOLVE";
    mainDesc.textContent   = "All 6 faces scanned. Press Solve to get the solution.";
    faceNameEl.textContent = "—";
    const badge = document.getElementById("shot-badge");
    if (badge) { badge.textContent="ALL DONE"; badge.style.background="var(--accent2)"; }
  }
});

// ── FACE THUMBNAILS ──────────────────────────────────────
function addFaceThumb(index, colors) {
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

function initSlots() {
  facesRow.innerHTML = "";
  for (let i=0; i<6; i++) {
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

  let stateStr = "";
  for (const letter of CUBING_ORDER) {
    const ourIdx = OUR_IDX_FOR_FACE[letter];
    for (const colorName of faceColors[ourIdx]) stateStr += COLOR_TO_FACE[colorName];
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
    chip.className = "move-chip";
    chip.textContent = m;
    wrap.appendChild(chip);
  });
  const twisty = document.getElementById("twisty");
  twisty.setAttribute("alg", algString);
  document.getElementById("twisty-wrap").style.display = "block";
  solutionArea.style.display = "block";
  solutionArea.scrollIntoView({ behavior:"smooth" });
}

// ── RESET ─────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  currentFace = 0;
  faceColors  = [];
  faceHexGrid = Array.from({length:6}, () =>
    Array.from({length:4}, () => Array(4).fill(DEFAULT_HEX))
  );

  document.querySelectorAll(".face-step").forEach((s,i) => {
    s.classList.remove("active","done");
    if (i===0) s.classList.add("active");
  });

  faceNameEl.textContent = FACE_NAMES[0];
  faceNumEl.textContent  = "0";
  mainTitle.textContent  = "SCAN FACE 1 OF 6";
  mainDesc.innerHTML     = `Hold the <strong>White (Top)</strong> face up to the camera, then press Capture.`;

  captureBtn.disabled    = false;
  captureBtn.textContent = "📸 \u00a0Capture Face";
  solveRow.style.display = "none";
  solutionArea.style.display = "none";
  resetBtn.style.display = "none";

  solveBtn.innerHTML = "✅ \u00a0Solve the Cube!";
  solveBtn.disabled  = false;

  document.getElementById("twisty-wrap").style.display = "block";
  document.getElementById("move-count").textContent    = "";

  const badge = document.getElementById("shot-badge");
  if (badge) { badge.textContent="PHOTO 1 OF 6"; badge.style.background="var(--accent)"; badge.style.color="#000"; }

  initSlots();
});
