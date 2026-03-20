// ═══════════════════════════════════════════════════
//  CubeSolve — script.js
//  2-shot corner flow · Gemini vision · live 3D cube
// ═══════════════════════════════════════════════════

// Face order: U=top F=front R=right B=back L=left D=bottom
const FACE_NAMES = {
  U:"Top (White)",  F:"Front (Green)", R:"Right (Red)",
  B:"Back (Blue)",  L:"Left (Orange)", D:"Bottom (Yellow)"
};

// Shot → which 3 faces it covers
const SHOT_FACES = {
  1: ["U","F","R"],
  2: ["D","B","L"],
};

const SHOT_INSTRUCTIONS = {
  1: "Hold cube so <strong>Top, Front & Right</strong> faces are visible — align the corner to the dot.",
  2: "Flip cube. Hold so <strong>Bottom, Back & Left</strong> faces are visible — align that corner to the dot.",
};

// cubing.js face order for solve string
const CUBING_ORDER     = ["U","R","F","D","L","B"];
const COLOR_TO_FACE    = {
  white:"U", red:"R", green:"F", yellow:"D", orange:"L", blue:"B"
};

const CUBE_COLORS = {
  white:  { hex:"#f0f0f0" },
  yellow: { hex:"#ffd200" },
  red:    { hex:"#d21919" },
  orange: { hex:"#ff6400" },
  blue:   { hex:"#0046c8" },
  green:  { hex:"#009b2d" },
};
const ALL_COLORS  = Object.keys(CUBE_COLORS);
const DEFAULT_HEX = "#222";

// ── STATE ────────────────────────────────────────────────
let currentShot = 1;   // 1 or 2
let analyzing   = false;

// faceData[faceKey] = array of 16 color name strings
const faceData = { U:null, F:null, R:null, B:null, L:null, D:null };

// faceHexGrid[faceIdx][row][col] for 3D renderer
// Face index: 0=U 1=F 2=R 3=B 4=L 5=D
const FACE_IDX = { U:0, F:1, R:2, B:3, L:4, D:5 };
let faceHexGrid = Array.from({length:6}, () =>
  Array.from({length:4}, () => Array(4).fill(DEFAULT_HEX))
);

// ── DOM refs ─────────────────────────────────────────────
const gateEl       = document.getElementById("gate");
const appEl        = document.getElementById("app");
const codeInput    = document.getElementById("code-input");
const enterBtn     = document.getElementById("enter-btn");
const gateError    = document.getElementById("gate-error");
const video        = document.getElementById("camera");
const overlay      = document.getElementById("overlay");
const ctx          = overlay.getContext("2d");
const captureBtn   = document.getElementById("capture-btn");
const solveRow     = document.getElementById("solve-row");
const solveBtn     = document.getElementById("solve-btn");
const resetBtn     = document.getElementById("reset-btn");
const solutionArea = document.getElementById("solution-area");
const facesRow     = document.getElementById("faces-row");
const faceNameEl   = document.getElementById("face-name");
const faceNumEl    = document.getElementById("face-num");
const mainTitle    = document.getElementById("main-title");
const mainDesc     = document.getElementById("main-desc");

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
      enterBtn.disabled    = false;
      enterBtn.textContent = "Enter";
    }
  } catch {
    gateError.textContent = "Network error — try again.";
    enterBtn.disabled    = false;
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
//  GRID OVERLAY — isometric 3-face corner guide
// ══════════════════════════════════════════════════════════
function drawGrid() {
  const w = overlay.width, h = overlay.height;
  ctx.clearRect(0, 0, w, h);

  const N    = 4;
  const cell = Math.min(w, h) * 0.10;
  const cx   = w / 2;
  const cy   = h * 0.50;

  // Iso axes
  const rx = cell,  ry = cell * 0.5;
  const lx = -cell, ly = cell * 0.5;
  const dy = cell;

  // Top face goes up from (cx,cy), side faces go down
  function tp(c, r) { return [cx + c*rx + r*lx,  cy + c*ry - r*ly - N*dy + N*ly]; }
  function rp(c, r) { return [cx + c*rx,          cy + c*ry + r*dy]; }
  function lp(c, r) { return [cx + c*lx,          cy + c*ly + r*dy]; }

  // Recalculate: front corner where faces meet = (cx, cy)
  // Top face: front point = (cx,cy), right = tp(N,0), back = tp(N,N), left = tp(0,N)
  // Use clean vectors: top face right-vec=(rx,-ry), back-vec=(lx,-ly) → goes upward
  function top(c, r) { return [cx + c*rx  + r*lx,  cy - c*ry - r*ly]; }
  function rit(c, r) { return [cx + c*rx,           cy + c*ry + r*dy]; }
  function lft(c, r) { return [cx + c*lx,           cy + c*ly + r*dy]; }

  const ACCENT = "#c8f135";
  const SGLOW  = "rgba(200,241,53,0.65)";

  function drawSticker(corners) {
    const inset = 0.12;
    const mcx = corners.reduce((s,p)=>s+p[0],0)/4;
    const mcy = corners.reduce((s,p)=>s+p[1],0)/4;
    const pts = corners.map(([x,y]) => [x+(mcx-x)*inset, y+(mcy-y)*inset]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i=1; i<4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.strokeStyle = SGLOW;
    ctx.lineWidth   = 1.3;
    ctx.stroke();
  }

  for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
    drawSticker([top(c,r), top(c+1,r), top(c+1,r+1), top(c,r+1)]);
    drawSticker([rit(c,r), rit(c+1,r), rit(c+1,r+1), rit(c,r+1)]);
    drawSticker([lft(c,r), lft(c+1,r), lft(c+1,r+1), lft(c,r+1)]);
  }

  // Bold edges
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = "round";
  ctx.lineCap     = "round";

  function edge(a,b,c,d) {
    ctx.beginPath();
    ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]);
    ctx.lineTo(c[0],c[1]); ctx.lineTo(d[0],d[1]);
    ctx.closePath(); ctx.stroke();
  }
  edge(top(0,0), top(N,0), top(N,N), top(0,N));
  edge(rit(0,0), rit(N,0), rit(N,N), rit(0,N));
  edge(lft(0,0), lft(N,0), lft(N,N), lft(0,N));

  // Center dot
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI*2);
  ctx.fillStyle = ACCENT; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(200,241,53,0.3)"; ctx.lineWidth=1.5; ctx.stroke();

  requestAnimationFrame(drawGrid);
}

// ══════════════════════════════════════════════════════════
//  ROTATING 4×4 CUBE PREVIEW
// ══════════════════════════════════════════════════════════
let cubeAngle = 0.5;

function startCubePreview() {
  const canvas = document.getElementById("ref-cube");
  if (!canvas) return;
  const rc = canvas.getContext("2d");
  (function loop() {
    cubeAngle += 0.007;
    drawRotatingCube(rc, canvas.width, canvas.height, cubeAngle);
    requestAnimationFrame(loop);
  })();
}

function drawRotatingCube(rc, W, H, angle) {
  rc.clearRect(0, 0, W, H);
  const N     = 4;
  const scale = Math.min(W, H) * 0.155;
  const cx    = W * 0.5, cy = H * 0.52;
  const tiltX = 0.50;
  const half  = N / 2;
  const INSET = 0.08;

  function project(x, y, z) {
    const x1 =  x*Math.cos(angle) + z*Math.sin(angle);
    const z1 = -x*Math.sin(angle) + z*Math.cos(angle);
    const y2 =  y*Math.cos(tiltX) - z1*Math.sin(tiltX);
    const z2 =  y*Math.sin(tiltX) + z1*Math.cos(tiltX);
    return { sx: cx + x1*scale, sy: cy - y2*scale, depth: z2 };
  }

  function faceVisible(nx, ny, nz) {
    const nx1 =  nx*Math.cos(angle) + nz*Math.sin(angle);
    const nz1 = -nx*Math.sin(angle) + nz*Math.cos(angle);
    const ny2 =  ny*Math.cos(tiltX) - nz1*Math.sin(tiltX);
    const nz2 =  ny*Math.sin(tiltX) + nz1*Math.cos(tiltX);
    return -nz2 > 0.04;
  }

  const faceDefs = [
    { fi:0, nx:0,  ny:1,  nz:0,
      q:(c,r)=>[project(-half+c,+half,-half+r),project(-half+c+1,+half,-half+r),project(-half+c+1,+half,-half+r+1),project(-half+c,+half,-half+r+1)] },
    { fi:1, nx:0,  ny:0,  nz:1,
      q:(c,r)=>[project(-half+c,+half-r,+half),project(-half+c+1,+half-r,+half),project(-half+c+1,+half-r-1,+half),project(-half+c,+half-r-1,+half)] },
    { fi:2, nx:1,  ny:0,  nz:0,
      q:(c,r)=>[project(+half,+half-r,-half+c),project(+half,+half-r,-half+c+1),project(+half,+half-r-1,-half+c+1),project(+half,+half-r-1,-half+c)] },
    { fi:3, nx:0,  ny:0,  nz:-1,
      q:(c,r)=>[project(+half-c,+half-r,-half),project(+half-c-1,+half-r,-half),project(+half-c-1,+half-r-1,-half),project(+half-c,+half-r-1,-half)] },
    { fi:4, nx:-1, ny:0,  nz:0,
      q:(c,r)=>[project(-half,+half-r,+half-c),project(-half,+half-r,+half-c-1),project(-half,+half-r-1,+half-c-1),project(-half,+half-r-1,+half-c)] },
    { fi:5, nx:0,  ny:-1, nz:0,
      q:(c,r)=>[project(-half+c,-half,+half-r),project(-half+c+1,-half,+half-r),project(-half+c+1,-half,+half-r-1),project(-half+c,-half,+half-r-1)] },
  ];

  const allQuads = [];
  for (const fd of faceDefs) {
    if (!faceVisible(fd.nx, fd.ny, fd.nz)) continue;
    for (let r=0; r<N; r++) for (let c=0; c<N; c++) {
      const pts = fd.q(c, r);
      const depth = pts.reduce((s,p)=>s+p.depth,0)/4;
      allQuads.push({ pts, depth, hex: faceHexGrid[fd.fi][r][c] });
    }
  }
  allQuads.sort((a,b) => a.depth - b.depth);

  for (const { pts, hex } of allQuads) {
    const [p0,p1,p2,p3] = pts;
    rc.beginPath();
    rc.moveTo(p0.sx,p0.sy); rc.lineTo(p1.sx,p1.sy);
    rc.lineTo(p2.sx,p2.sy); rc.lineTo(p3.sx,p3.sy);
    rc.closePath(); rc.fillStyle = "#0d0d0d"; rc.fill();

    const mcx=(p0.sx+p1.sx+p2.sx+p3.sx)/4, mcy=(p0.sy+p1.sy+p2.sy+p3.sy)/4;
    function lerp(a,b,t){return{sx:a.sx+(b.sx-a.sx)*t,sy:a.sy+(b.sy-a.sy)*t};}
    const C={sx:mcx,sy:mcy};
    const i0=lerp(p0,C,INSET),i1=lerp(p1,C,INSET),i2=lerp(p2,C,INSET),i3=lerp(p3,C,INSET);
    rc.beginPath();
    rc.moveTo(i0.sx,i0.sy); rc.lineTo(i1.sx,i1.sy);
    rc.lineTo(i2.sx,i2.sy); rc.lineTo(i3.sx,i3.sy);
    rc.closePath(); rc.fillStyle = hex; rc.fill();
    if (hex !== DEFAULT_HEX) {
      rc.strokeStyle="rgba(255,255,255,0.15)"; rc.lineWidth=0.5; rc.stroke();
    }
  }
}

function updateCubeFromFaceData(faceKey, colors16) {
  const fi = FACE_IDX[faceKey];
  for (let r=0; r<4; r++) for (let c=0; c<4; c++) {
    const name = colors16[r*4+c];
    faceHexGrid[fi][r][c] = CUBE_COLORS[name]?.hex || DEFAULT_HEX;
  }
}

// ══════════════════════════════════════════════════════════
//  CAPTURE + GEMINI ANALYSIS
// ══════════════════════════════════════════════════════════
captureBtn.addEventListener("click", async () => {
  if (analyzing) return;
  analyzing = true;
  captureBtn.disabled  = true;
  captureBtn.innerHTML = '<span class="spinner"></span> Analyzing...';

  // Snapshot current frame as JPEG base64
  const snap = document.createElement("canvas");
  snap.width  = video.videoWidth  || 640;
  snap.height = video.videoHeight || 480;
  snap.getContext("2d").drawImage(video, 0, 0);
  const imageB64 = snap.toDataURL("image/jpeg", 0.85).split(",")[1];

  try {
    const res  = await fetch("/analyze-shot", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ shot: currentShot, image: imageB64 })
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    // Store + update 3D cube for each returned face
    for (const [faceKey, colors] of Object.entries(data)) {
      faceData[faceKey] = colors;
      updateCubeFromFaceData(faceKey, colors);
    }

    // Show editable sticker grids for this shot's faces
    showFaceEditors(SHOT_FACES[currentShot], data);

    // Advance to next shot or finish
    if (currentShot === 1) {
      currentShot = 2;
      updateShotUI();
      captureBtn.disabled  = false;
      captureBtn.textContent = "📸  Capture Shot 2";
    } else {
      // Both shots done
      captureBtn.disabled  = true;
      captureBtn.textContent = "✅  Both shots captured!";
      solveRow.style.display = "flex";
      resetBtn.style.display = "block";
      mainTitle.textContent  = "READY TO SOLVE";
      mainDesc.textContent   = "All faces scanned. Check the cube above then press Solve.";
      faceNameEl.textContent = "—";
      const badge = document.getElementById("shot-badge");
      if (badge) { badge.textContent="ALL DONE"; badge.style.background="var(--accent2)"; }
    }

  } catch (err) {
    showError("Gemini couldn't read the faces: " + err.message);
    captureBtn.disabled  = false;
    captureBtn.textContent = `📸  Retry Shot ${currentShot}`;
  }

  analyzing = false;
});

function updateShotUI() {
  mainTitle.textContent = "SHOT 2 OF 2";
  mainDesc.innerHTML    = SHOT_INSTRUCTIONS[2];
  faceNameEl.textContent = "Bottom corner";
  faceNumEl.textContent  = "1";
  const badge = document.getElementById("shot-badge");
  if (badge) badge.textContent = "PHOTO 2 OF 2";
}

// ── EDITABLE FACE GRIDS (tap to fix) ─────────────────────
function showFaceEditors(faceKeys, data) {
  // Remove old editors for this shot
  document.querySelectorAll(".face-editor").forEach(el => {
    if (faceKeys.includes(el.dataset.face)) el.remove();
  });

  faceKeys.forEach(fk => {
    const colors = data[fk] || Array(16).fill("white");
    const wrap = document.createElement("div");
    wrap.className   = "face-editor";
    wrap.dataset.face = fk;

    const title = document.createElement("div");
    title.className   = "face-editor-title";
    title.textContent = FACE_NAMES[fk];
    wrap.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "editor-grid";

    colors.forEach((colorName, idx) => {
      const cell = document.createElement("div");
      cell.className = "editor-cell";
      cell.style.background = CUBE_COLORS[colorName]?.hex || DEFAULT_HEX;
      cell.dataset.idx   = idx;
      cell.dataset.color = colorName;

      cell.addEventListener("click", () => openColorPicker(cell, fk, idx));
      grid.appendChild(cell);
    });

    wrap.appendChild(grid);
    facesRow.appendChild(wrap);
  });
}

// ── COLOR PICKER POPOVER ──────────────────────────────────
let activePopover = null;

function openColorPicker(cell, faceKey, idx) {
  closeColorPicker();

  const pop = document.createElement("div");
  pop.className = "color-popover";

  ALL_COLORS.forEach(colorName => {
    const swatch = document.createElement("div");
    swatch.className = "color-swatch";
    swatch.style.background = CUBE_COLORS[colorName].hex;
    swatch.title = colorName;
    if (colorName === cell.dataset.color) swatch.classList.add("selected");

    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      // Update cell
      cell.style.background = CUBE_COLORS[colorName].hex;
      cell.dataset.color    = colorName;
      // Update state
      faceData[faceKey][idx] = colorName;
      // Update 3D cube
      const r = Math.floor(idx / 4), c = idx % 4;
      faceHexGrid[FACE_IDX[faceKey]][r][c] = CUBE_COLORS[colorName].hex;
      closeColorPicker();
    });
    pop.appendChild(swatch);
  });

  // Position below cell
  const rect = cell.getBoundingClientRect();
  pop.style.top  = (rect.bottom + window.scrollY + 6) + "px";
  pop.style.left = (rect.left   + window.scrollX)     + "px";
  document.body.appendChild(pop);
  activePopover = pop;

  setTimeout(() => document.addEventListener("click", closeColorPicker, {once:true}), 0);
}

function closeColorPicker() {
  if (activePopover) { activePopover.remove(); activePopover = null; }
}

// ── ERROR BOX ─────────────────────────────────────────────
function showError(msg) {
  let box = document.getElementById("err-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "err-box";
    box.className = "error-box";
    facesRow.before(box);
  }
  box.innerHTML = `<strong>Error:</strong> ${msg}`;
  box.style.display = "block";
  setTimeout(() => { if (box) box.style.display="none"; }, 6000);
}

// ── SOLVE ─────────────────────────────────────────────────
solveBtn.addEventListener("click", async () => {
  solveBtn.innerHTML = '<span class="spinner"></span> Solving...';
  solveBtn.disabled  = true;

  let stateStr = "";
  for (const letter of CUBING_ORDER) {
    const colors = faceData[letter];
    if (!colors) { showError(`Face ${letter} not scanned yet.`); solveBtn.innerHTML="✅  Solve"; solveBtn.disabled=false; return; }
    for (const colorName of colors) stateStr += COLOR_TO_FACE[colorName];
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
    document.getElementById("move-count").textContent   = "";
    const errBox = document.createElement("div");
    errBox.className = "error-box";
    errBox.innerHTML = `<strong>Could not solve — colours may be wrong.</strong><br><br>Check the 3D cube above and tap any wrong sticker to fix it, then try Solve again.`;
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
    chip.className = "move-chip"; chip.textContent = m;
    wrap.appendChild(chip);
  });
  document.getElementById("twisty").setAttribute("alg", algString);
  document.getElementById("twisty-wrap").style.display = "block";
  solutionArea.style.display = "block";
  solutionArea.scrollIntoView({ behavior:"smooth" });
}

// ── RESET ─────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  currentShot = 1;
  analyzing   = false;
  Object.keys(faceData).forEach(k => faceData[k] = null);
  faceHexGrid = Array.from({length:6}, () =>
    Array.from({length:4}, () => Array(4).fill(DEFAULT_HEX))
  );

  document.querySelectorAll(".face-step").forEach((s,i) => {
    s.classList.remove("active","done");
    if (i===0) s.classList.add("active");
  });

  faceNameEl.textContent = "Top corner";
  faceNumEl.textContent  = "0";
  mainTitle.textContent  = "SHOT 1 OF 2";
  mainDesc.innerHTML     = SHOT_INSTRUCTIONS[1];

  captureBtn.disabled    = false;
  captureBtn.textContent = "📸  Capture Shot 1";
  solveRow.style.display = "none";
  solutionArea.style.display = "none";
  resetBtn.style.display = "none";
  solveBtn.innerHTML     = "✅  Solve the Cube!";
  solveBtn.disabled      = false;

  document.getElementById("twisty-wrap").style.display = "block";
  document.getElementById("move-count").textContent    = "";
  document.querySelectorAll(".face-editor").forEach(el => el.remove());

  const badge = document.getElementById("shot-badge");
  if (badge) { badge.textContent="PHOTO 1 OF 2"; badge.style.background="var(--accent)"; badge.style.color="#000"; }
});
