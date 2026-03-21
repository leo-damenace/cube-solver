// ═══════════════════════════════════════════════════
//  CubeSolve — script.js
//  6-face scan · one Gemini call per face · live 3D cube
// ═══════════════════════════════════════════════════

// Face scan order and display info
const FACES = [
  { key:"U", label:"Top",    color:"⬜", hint:"Hold the cube with the TOP face flat toward the camera." },
  { key:"F", label:"Front",  color:"🟩", hint:"Rotate cube — now point the FRONT face at the camera." },
  { key:"R", label:"Right",  color:"🟥", hint:"Rotate cube — now point the RIGHT face at the camera." },
  { key:"B", label:"Back",   color:"🟦", hint:"Rotate cube — now point the BACK face at the camera." },
  { key:"L", label:"Left",   color:"🟧", hint:"Rotate cube — now point the LEFT face at the camera." },
  { key:"D", label:"Bottom", color:"🟨", hint:"Flip cube — point the BOTTOM face at the camera." },
];

const CUBING_ORDER  = ["U","R","F","D","L","B"];
const COLOR_TO_FACE = { white:"U", red:"R", green:"F", yellow:"D", orange:"L", blue:"B" };

const CUBE_COLORS = {
  white:  { hex:"#f0f0f0" },
  yellow: { hex:"#ffd200" },
  red:    { hex:"#d21919" },
  orange: { hex:"#ff6400" },
  blue:   { hex:"#0046c8" },
  green:  { hex:"#009b2d" },
};
const ALL_COLORS  = Object.keys(CUBE_COLORS);
const DEFAULT_HEX = "#2a2a2a";

// ── STATE ─────────────────────────────────────────────────
let currentFaceIdx = 0;
let analyzing      = false;

// faceData[key] = [16 color strings]
const faceData = {};

// faceHexGrid[faceIdx][row][col] for 3D renderer
const FACE_3D_IDX = { U:0, F:1, R:2, B:3, L:4, D:5 };
let faceHexGrid = Array.from({length:6}, () =>
  Array.from({length:4}, () => Array(4).fill(DEFAULT_HEX))
);

// ── DOM ───────────────────────────────────────────────────
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

// ── GATE ──────────────────────────────────────────────────
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
      gateError.textContent = "Invalid code.";
      codeInput.classList.add("shake");
      codeInput.addEventListener("animationend", () => codeInput.classList.remove("shake"), {once:true});
      enterBtn.disabled    = false;
      enterBtn.textContent = "Enter";
    }
  } catch {
    gateError.textContent = "Network error.";
    enterBtn.disabled    = false;
    enterBtn.textContent = "Enter";
  }
}
enterBtn.addEventListener("click", checkCode);
codeInput.addEventListener("keydown", e => { if (e.key==="Enter") checkCode(); });
codeInput.addEventListener("input",   () => { gateError.textContent = ""; });

// ── CAMERA ────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:"environment", width:{ideal:1280}, height:{ideal:960} }
    });
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", () => {
      overlay.width  = video.videoWidth  || video.clientWidth;
      overlay.height = video.videoHeight || video.clientHeight;
      drawOverlay();
    });
  } catch {
    alert("Camera access denied. Please allow camera and reload.");
  }
}

// ── OVERLAY — clean square guide, no isometric nonsense ───
function drawOverlay() {
  const w = overlay.width, h = overlay.height;
  ctx.clearRect(0, 0, w, h);

  // Vignette
  const grad = ctx.createRadialGradient(w/2,h/2,h*0.22,w/2,h/2,h*0.65);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,w,h);

  // Square scan zone
  const size = Math.min(w,h) * 0.72;
  const sx   = (w - size) / 2;
  const sy   = (h - size) / 2;

  // Dimmed area outside square
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0,0,w,sy);
  ctx.fillRect(0,sy+size,w,h-sy-size);
  ctx.fillRect(0,sy,sx,size);
  ctx.fillRect(sx+size,sy,w-sx-size,size);

  // 4×4 grid lines inside square
  const cell = size / 4;
  ctx.strokeStyle = "rgba(200,241,53,0.4)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(sx+i*cell, sy); ctx.lineTo(sx+i*cell, sy+size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, sy+i*cell); ctx.lineTo(sx+size, sy+i*cell); ctx.stroke();
  }

  // Bold corner brackets
  const bL = size * 0.08;
  ctx.strokeStyle = "#c8f135";
  ctx.lineWidth   = 3;
  ctx.lineCap     = "round";
  [
    [sx,      sy,       1, 1],
    [sx+size, sy,      -1, 1],
    [sx,      sy+size,  1,-1],
    [sx+size, sy+size, -1,-1],
  ].forEach(([x,y,dx,dy]) => {
    ctx.beginPath(); ctx.moveTo(x+dx*bL,y); ctx.lineTo(x,y); ctx.lineTo(x,y+dy*bL); ctx.stroke();
  });

  requestAnimationFrame(drawOverlay);
}

// ── ROTATING 4×4 CUBE PREVIEW ────────────────────────────
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
  rc.clearRect(0,0,W,H);
  const N=4, scale=Math.min(W,H)*0.155, cx=W*0.5, cy=H*0.52, tiltX=0.50, half=N/2, INSET=0.08;

  function project(x,y,z) {
    const x1=x*Math.cos(angle)+z*Math.sin(angle), z1=-x*Math.sin(angle)+z*Math.cos(angle);
    const y2=y*Math.cos(tiltX)-z1*Math.sin(tiltX), z2=y*Math.sin(tiltX)+z1*Math.cos(tiltX);
    return {sx:cx+x1*scale, sy:cy-y2*scale, depth:z2};
  }
  function faceVisible(nx,ny,nz) {
    const nx1=nx*Math.cos(angle)+nz*Math.sin(angle), nz1=-nx*Math.sin(angle)+nz*Math.cos(angle);
    const ny2=ny*Math.cos(tiltX)-nz1*Math.sin(tiltX), nz2=ny*Math.sin(tiltX)+nz1*Math.cos(tiltX);
    return -nz2>0.04;
  }
  const faceDefs = [
    {fi:0,nx:0,ny:1,nz:0,   q:(c,r)=>[project(-half+c,+half,-half+r),project(-half+c+1,+half,-half+r),project(-half+c+1,+half,-half+r+1),project(-half+c,+half,-half+r+1)]},
    {fi:1,nx:0,ny:0,nz:1,   q:(c,r)=>[project(-half+c,+half-r,+half),project(-half+c+1,+half-r,+half),project(-half+c+1,+half-r-1,+half),project(-half+c,+half-r-1,+half)]},
    {fi:2,nx:1,ny:0,nz:0,   q:(c,r)=>[project(+half,+half-r,-half+c),project(+half,+half-r,-half+c+1),project(+half,+half-r-1,-half+c+1),project(+half,+half-r-1,-half+c)]},
    {fi:3,nx:0,ny:0,nz:-1,  q:(c,r)=>[project(+half-c,+half-r,-half),project(+half-c-1,+half-r,-half),project(+half-c-1,+half-r-1,-half),project(+half-c,+half-r-1,-half)]},
    {fi:4,nx:-1,ny:0,nz:0,  q:(c,r)=>[project(-half,+half-r,+half-c),project(-half,+half-r,+half-c-1),project(-half,+half-r-1,+half-c-1),project(-half,+half-r-1,+half-c)]},
    {fi:5,nx:0,ny:-1,nz:0,  q:(c,r)=>[project(-half+c,-half,+half-r),project(-half+c+1,-half,+half-r),project(-half+c+1,-half,+half-r-1),project(-half+c,-half,+half-r-1)]},
  ];
  const allQuads=[];
  for (const fd of faceDefs) {
    if (!faceVisible(fd.nx,fd.ny,fd.nz)) continue;
    for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
      const pts=fd.q(c,r);
      allQuads.push({pts, depth:pts.reduce((s,p)=>s+p.depth,0)/4, hex:faceHexGrid[fd.fi][r][c]});
    }
  }
  allQuads.sort((a,b)=>a.depth-b.depth);
  for (const {pts,hex} of allQuads) {
    const [p0,p1,p2,p3]=pts;
    rc.beginPath(); rc.moveTo(p0.sx,p0.sy); rc.lineTo(p1.sx,p1.sy); rc.lineTo(p2.sx,p2.sy); rc.lineTo(p3.sx,p3.sy); rc.closePath();
    rc.fillStyle="#0d0d0d"; rc.fill();
    const mcx=(p0.sx+p1.sx+p2.sx+p3.sx)/4, mcy=(p0.sy+p1.sy+p2.sy+p3.sy)/4;
    function lerp(a,b,t){return{sx:a.sx+(b.sx-a.sx)*t,sy:a.sy+(b.sy-a.sy)*t};}
    const C={sx:mcx,sy:mcy};
    const i0=lerp(p0,C,INSET),i1=lerp(p1,C,INSET),i2=lerp(p2,C,INSET),i3=lerp(p3,C,INSET);
    rc.beginPath(); rc.moveTo(i0.sx,i0.sy); rc.lineTo(i1.sx,i1.sy); rc.lineTo(i2.sx,i2.sy); rc.lineTo(i3.sx,i3.sy); rc.closePath();
    rc.fillStyle=hex; rc.fill();
    if (hex!==DEFAULT_HEX){rc.strokeStyle="rgba(255,255,255,0.15)";rc.lineWidth=0.5;rc.stroke();}
  }
}

function updateCubeColors(faceKey, colors16) {
  const fi = FACE_3D_IDX[faceKey];
  for (let r=0;r<4;r++) for (let c=0;c<4;c++)
    faceHexGrid[fi][r][c] = CUBE_COLORS[colors16[r*4+c]]?.hex || DEFAULT_HEX;
}

// ── CAPTURE ───────────────────────────────────────────────
captureBtn.addEventListener("click", async () => {
  if (analyzing) return;
  analyzing = true;
  captureBtn.disabled  = true;
  captureBtn.innerHTML = '<span class="spinner"></span> Analyzing...';

  // Snapshot
  const snap = document.createElement("canvas");
  snap.width  = video.videoWidth  || 640;
  snap.height = video.videoHeight || 480;
  snap.getContext("2d").drawImage(video,0,0);

  // Crop to the square scan zone (same math as overlay)
  const sw = snap.width, sh = snap.height;
  const size = Math.min(sw,sh) * 0.72;
  const sx   = (sw-size)/2, sy=(sh-size)/2;

  // Crop canvas
  const crop = document.createElement("canvas");
  crop.width = crop.height = 480; // fixed size for Gemini
  crop.getContext("2d").drawImage(snap, sx,sy,size,size, 0,0,480,480);
  const imageB64 = crop.toDataURL("image/jpeg",0.90).split(",")[1];
  const photoURL = crop.toDataURL("image/jpeg",0.80);

  const face = FACES[currentFaceIdx];

  try {
    const res  = await fetch("/analyze-face", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ image: imageB64 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const colors = data.colors;
    faceData[face.key] = colors;
    updateCubeColors(face.key, colors);

    // Show face result card
    showFaceResult(face, colors, photoURL, currentFaceIdx);

    // Update sidebar
    const steps = document.querySelectorAll(".face-step");
    if (steps[currentFaceIdx]) {
      steps[currentFaceIdx].classList.remove("active");
      steps[currentFaceIdx].classList.add("done");
    }

    currentFaceIdx++;
    faceNumEl.textContent = currentFaceIdx;

    if (currentFaceIdx < 6) {
      const nextFace = FACES[currentFaceIdx];
      if (steps[currentFaceIdx]) steps[currentFaceIdx].classList.add("active");
      mainTitle.textContent  = `FACE ${currentFaceIdx+1} OF 6 — ${nextFace.label.toUpperCase()}`;
      mainDesc.textContent   = nextFace.hint;
      faceNameEl.textContent = nextFace.label;
      captureBtn.disabled    = false;
      captureBtn.textContent = `📸  Scan ${nextFace.label} Face`;
    } else {
      captureBtn.disabled    = true;
      captureBtn.textContent = "✅  All faces scanned!";
      solveRow.style.display = "flex";
      resetBtn.style.display = "block";
      mainTitle.textContent  = "READY TO SOLVE";
      mainDesc.textContent   = "Check the 3D cube — tap any wrong sticker to fix it, then press Solve.";
      faceNameEl.textContent = "—";
    }

  } catch (err) {
    showError("Gemini error: " + err.message);
    captureBtn.disabled  = false;
    captureBtn.textContent = `📸  Retry ${face.label} Face`;
  }
  analyzing = false;
});

// ── FACE RESULT CARD ──────────────────────────────────────
function showFaceResult(face, colors, photoURL, idx) {
  // Remove old card for this face if retrying
  const old = document.getElementById(`face-card-${face.key}`);
  if (old) old.remove();

  const card = document.createElement("div");
  card.id        = `face-card-${face.key}`;
  card.className = "face-result-card";

  // Header
  const hdr = document.createElement("div");
  hdr.className   = "face-result-hdr";
  hdr.textContent = `${face.color} ${face.label} Face`;
  card.appendChild(hdr);

  // Body: photo + grid side by side
  const body = document.createElement("div");
  body.className = "face-result-body";

  // Photo thumbnail
  const img = document.createElement("img");
  img.src       = photoURL;
  img.className = "face-result-photo";
  body.appendChild(img);

  // 4×4 editable sticker grid
  const grid = document.createElement("div");
  grid.className = "editor-grid";
  colors.forEach((colorName, i) => {
    const cell = document.createElement("div");
    cell.className = "editor-cell";
    cell.style.background = CUBE_COLORS[colorName]?.hex || DEFAULT_HEX;
    cell.dataset.color = colorName;
    cell.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      openColorPicker(cell, face.key, i);
    });
    grid.appendChild(cell);
  });
  body.appendChild(grid);
  card.appendChild(body);
  facesRow.appendChild(card);
}

// ── COLOR PICKER ──────────────────────────────────────────
let activePopover = null;
let pickerOpenTime = 0;

function openColorPicker(cell, faceKey, idx) {
  if (activePopover && activePopover._cell === cell) { closeColorPicker(); return; }
  closeColorPicker();
  pickerOpenTime = Date.now();

  const pop = document.createElement("div");
  pop.className = "color-popover";
  pop._cell = cell;

  ALL_COLORS.forEach(colorName => {
    const sw = document.createElement("div");
    sw.className = "color-swatch";
    sw.style.background = CUBE_COLORS[colorName].hex;
    sw.title = colorName;
    if (colorName === cell.dataset.color) sw.classList.add("selected");
    sw.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      cell.style.background  = CUBE_COLORS[colorName].hex;
      cell.dataset.color     = colorName;
      if (faceData[faceKey]) faceData[faceKey][idx] = colorName;
      const r=Math.floor(idx/4), c=idx%4;
      faceHexGrid[FACE_3D_IDX[faceKey]][r][c] = CUBE_COLORS[colorName].hex;
      closeColorPicker();
    });
    pop.appendChild(sw);
  });

  const rect = cell.getBoundingClientRect();
  const popW = ALL_COLORS.length * 36 + 16;
  let left   = rect.left + window.scrollX;
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  pop.style.top  = (rect.bottom + window.scrollY + 8) + "px";
  pop.style.left = Math.max(8, left) + "px";
  document.body.appendChild(pop);
  activePopover = pop;
}

function closeColorPicker() {
  if (activePopover) { activePopover.remove(); activePopover = null; }
}

document.addEventListener("pointerdown", (e) => {
  if (!activePopover) return;
  if (Date.now() - pickerOpenTime < 200) return;
  if (!activePopover.contains(e.target)) closeColorPicker();
});

// ── ERROR ─────────────────────────────────────────────────
function showError(msg) {
  let box = document.getElementById("err-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "err-box"; box.className = "error-box";
    facesRow.before(box);
  }
  box.innerHTML = `<strong>Error:</strong> ${msg}`;
  box.style.display = "block";
  setTimeout(() => { if(box) box.style.display="none"; }, 7000);
}

// ── SOLVE ─────────────────────────────────────────────────
solveBtn.addEventListener("click", async () => {
  solveBtn.innerHTML = '<span class="spinner"></span> Solving...';
  solveBtn.disabled  = true;

  let stateStr = "";
  for (const letter of CUBING_ORDER) {
    const colors = faceData[letter];
    if (!colors) {
      showError(`Face ${letter} not scanned.`);
      solveBtn.innerHTML = "✅  Solve the Cube!"; solveBtn.disabled = false; return;
    }
    for (const c of colors) stateStr += COLOR_TO_FACE[c];
  }

  try {
    const { experimental4x4x4Solve } = await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution = await experimental4x4x4Solve(stateStr);
    showSolution(solution.toString());
  } catch (err) {
    solutionArea.style.display = "block";
    document.getElementById("moves-wrap").innerHTML =
      `<div class="error-box"><strong>Could not solve.</strong><br>Check sticker colours and try again.</div>`;
    document.getElementById("twisty-wrap").style.display = "none";
    document.getElementById("move-count").textContent = "";
    solveBtn.innerHTML = "✅  Solve the Cube!"; solveBtn.disabled = false;
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
  solutionArea.scrollIntoView({behavior:"smooth"});
}

// ── RESET ─────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  currentFaceIdx = 0; analyzing = false;
  Object.keys(faceData).forEach(k => delete faceData[k]);
  faceHexGrid = Array.from({length:6},()=>Array.from({length:4},()=>Array(4).fill(DEFAULT_HEX)));

  document.querySelectorAll(".face-step").forEach((s,i) => {
    s.classList.remove("active","done");
    if (i===0) s.classList.add("active");
  });

  mainTitle.textContent  = "FACE 1 OF 6 — TOP";
  mainDesc.textContent   = FACES[0].hint;
  faceNameEl.textContent = "Top";
  faceNumEl.textContent  = "0";

  captureBtn.disabled    = false;
  captureBtn.textContent = "📸  Scan Top Face";
  solveRow.style.display = "none";
  solutionArea.style.display = "none";
  resetBtn.style.display = "none";
  solveBtn.innerHTML     = "✅  Solve the Cube!"; solveBtn.disabled = false;

  document.getElementById("twisty-wrap").style.display = "block";
  document.getElementById("move-count").textContent    = "";
  document.querySelectorAll(".face-result-card").forEach(el=>el.remove());
  const errBox = document.getElementById("err-box");
  if (errBox) errBox.style.display = "none";
});
