// ═══════════════════════════════════════════════════
//  CubeSolve — script.js
//  2-shot corner flow · Gemini vision · live 3D cube
// ═══════════════════════════════════════════════════

const FACE_NAMES = {
  U:"Top (White)",  F:"Front (Green)", R:"Right (Red)",
  B:"Back (Blue)",  L:"Left (Orange)", D:"Bottom (Yellow)"
};

const SHOT_FACES = {
  1: ["U","F","R"],
  2: ["D","B","L"],
};

const SHOT_INSTRUCTIONS = {
  1: "Hold cube so <strong>Top, Front & Right</strong> faces are visible — like looking at a corner from above.",
  2: "Flip cube to the opposite corner — <strong>Bottom, Back & Left</strong> faces visible.",
};

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
const DEFAULT_HEX = "#222";

// ── STATE ────────────────────────────────────────────────
let currentShot = 1;
let analyzing   = false;

const faceData = { U:null, F:null, R:null, B:null, L:null, D:null };

const FACE_IDX = { U:0, F:1, R:2, B:3, L:4, D:5 };
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
    alert("Camera access denied. Please allow camera permissions and reload.");
  }
}

// ── OVERLAY — corner brackets only, no grid ───────────────
function drawOverlay() {
  const w = overlay.width, h = overlay.height;
  ctx.clearRect(0, 0, w, h);

  // Soft vignette
  const grad = ctx.createRadialGradient(w/2,h/2,h*0.25,w/2,h/2,h*0.7);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,w,h);

  // Corner brackets
  const pad  = Math.min(w,h) * 0.10;
  const bLen = Math.min(w,h) * 0.10;
  ctx.strokeStyle = "#c8f135";
  ctx.lineWidth   = 3.5;
  ctx.lineCap     = "round";
  [
    [pad,   pad,    1,  1],
    [w-pad, pad,   -1,  1],
    [pad,   h-pad,  1, -1],
    [w-pad, h-pad, -1, -1],
  ].forEach(([x,y,dx,dy]) => {
    ctx.beginPath();
    ctx.moveTo(x+dx*bLen, y); ctx.lineTo(x,y); ctx.lineTo(x, y+dy*bLen);
    ctx.stroke();
  });

  // Center dot
  ctx.beginPath(); ctx.arc(w/2, h/2, 4, 0, Math.PI*2);
  ctx.fillStyle = "#c8f135"; ctx.fill();
  ctx.beginPath(); ctx.arc(w/2, h/2, 8, 0, Math.PI*2);
  ctx.strokeStyle = "rgba(200,241,53,0.35)"; ctx.lineWidth=1.5; ctx.stroke();

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
    rc.beginPath(); rc.moveTo(p0.sx,p0.sy); rc.lineTo(p1.sx,p1.sy);
    rc.lineTo(p2.sx,p2.sy); rc.lineTo(p3.sx,p3.sy); rc.closePath();
    rc.fillStyle="#0d0d0d"; rc.fill();
    const mcx=(p0.sx+p1.sx+p2.sx+p3.sx)/4, mcy=(p0.sy+p1.sy+p2.sy+p3.sy)/4;
    function lerp(a,b,t){return{sx:a.sx+(b.sx-a.sx)*t,sy:a.sy+(b.sy-a.sy)*t};}
    const C={sx:mcx,sy:mcy};
    const i0=lerp(p0,C,INSET),i1=lerp(p1,C,INSET),i2=lerp(p2,C,INSET),i3=lerp(p3,C,INSET);
    rc.beginPath(); rc.moveTo(i0.sx,i0.sy); rc.lineTo(i1.sx,i1.sy);
    rc.lineTo(i2.sx,i2.sy); rc.lineTo(i3.sx,i3.sy); rc.closePath();
    rc.fillStyle=hex; rc.fill();
    if (hex!==DEFAULT_HEX){rc.strokeStyle="rgba(255,255,255,0.15)";rc.lineWidth=0.5;rc.stroke();}
  }
}

function updateCubeFromFaceData(faceKey, colors16) {
  const fi = FACE_IDX[faceKey];
  for (let r=0;r<4;r++) for (let c=0;c<4;c++)
    faceHexGrid[fi][r][c] = CUBE_COLORS[colors16[r*4+c]]?.hex || DEFAULT_HEX;
}

// ── CAPTURE ───────────────────────────────────────────────
captureBtn.addEventListener("click", async () => {
  if (analyzing) return;
  analyzing = true;
  captureBtn.disabled  = true;
  captureBtn.innerHTML = '<span class="spinner"></span> Analyzing...';

  const snap = document.createElement("canvas");
  snap.width  = video.videoWidth  || 640;
  snap.height = video.videoHeight || 480;
  snap.getContext("2d").drawImage(video,0,0);

  const snapDataURL = snap.toDataURL("image/jpeg", 0.92);
  const imageB64    = snapDataURL.split(",")[1];

  try {
    const res  = await fetch("/analyze-shot", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ shot: currentShot, image: imageB64 })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    for (const [faceKey, colors] of Object.entries(data)) {
      faceData[faceKey] = colors;
      updateCubeFromFaceData(faceKey, colors);
    }

    showFaceEditors(SHOT_FACES[currentShot], data, currentShot, snapDataURL);

    // Update sidebar steps
    const steps = document.querySelectorAll(".face-step");
    if (currentShot === 1) {
      if (steps[0]) { steps[0].classList.remove("active"); steps[0].classList.add("done"); }
      if (steps[1]) steps[1].classList.add("active");
      currentShot = 2;
      updateShotUI();
      captureBtn.disabled  = false;
      captureBtn.textContent = "📸  Capture Shot 2";
    } else {
      if (steps[1]) { steps[1].classList.remove("active"); steps[1].classList.add("done"); }
      captureBtn.disabled  = true;
      captureBtn.textContent = "✅  Both shots captured!";
      solveRow.style.display = "flex";
      resetBtn.style.display = "block";
      mainTitle.textContent  = "READY TO SOLVE";
      mainDesc.textContent   = "Check the 3D cube above — tap any wrong sticker to fix it, then press Solve.";
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
  mainTitle.textContent  = "SHOT 2 OF 2";
  mainDesc.innerHTML     = SHOT_INSTRUCTIONS[2];
  faceNameEl.textContent = "Bottom corner";
  faceNumEl.textContent  = "1";
  const badge = document.getElementById("shot-badge");
  if (badge) badge.textContent = "SHOT 2 OF 2";
  const g1 = document.getElementById("guide-shot1");
  const g2 = document.getElementById("guide-shot2");
  if (g1) g1.style.display = "none";
  if (g2) g2.style.display = "block";
}

// ── FACE EDITORS ─────────────────────────────────────────
function showFaceEditors(faceKeys, data, shotNum, photoDataURL) {
  document.querySelectorAll(`[data-shot="${shotNum}"]`).forEach(el => el.remove());

  // Shot header
  const hdr = document.createElement("div");
  hdr.className = "section-label";
  hdr.setAttribute("data-shot", shotNum);
  hdr.textContent = `SHOT ${shotNum} — TAP ANY STICKER TO CORRECT`;
  facesRow.appendChild(hdr);

  // Photo thumbnail
  if (photoDataURL) {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-shot", shotNum);
    wrap.style.cssText = "margin-bottom:0.8rem;";
    const img = document.createElement("img");
    img.src = photoDataURL;
    img.style.cssText = "width:100%;max-width:320px;border-radius:10px;border:1px solid #2c2c2c;display:block;";
    const lbl = document.createElement("div");
    lbl.style.cssText = "font-size:0.65rem;color:#666;letter-spacing:2px;text-transform:uppercase;margin-top:0.4rem;";
    lbl.textContent = `Shot ${shotNum} photo`;
    wrap.appendChild(img);
    wrap.appendChild(lbl);
    facesRow.appendChild(wrap);
  }

  // One grid per face
  faceKeys.forEach(fk => {
    const colors = data[fk] || Array(16).fill("white");
    const wrap = document.createElement("div");
    wrap.setAttribute("data-shot", shotNum);
    wrap.style.cssText = "margin-bottom:1rem;";

    const title = document.createElement("div");
    title.style.cssText = "font-size:0.65rem;letter-spacing:3px;text-transform:uppercase;color:#666;margin-bottom:0.5rem;";
    title.textContent = FACE_NAMES[fk];
    wrap.appendChild(title);

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:4px;max-width:180px;";

    colors.forEach((colorName, idx) => {
      const cell = document.createElement("div");
      cell.style.cssText = "aspect-ratio:1;border-radius:4px;border:2px solid rgba(0,0,0,0.3);cursor:pointer;transition:transform 0.1s;";
      cell.style.background = CUBE_COLORS[colorName]?.hex || DEFAULT_HEX;
      cell.dataset.color = colorName;
      cell.addEventListener("pointerdown", (e) => { e.stopPropagation(); openColorPicker(cell, fk, idx); });
      grid.appendChild(cell);
    });

    wrap.appendChild(grid);
    facesRow.appendChild(wrap);
  });
}

// ── COLOR PICKER ─────────────────────────────────────────
let activePopover = null;
let pickerOpenTime = 0;

function openColorPicker(cell, faceKey, idx) {
  if (activePopover && activePopover._cell === cell) { closeColorPicker(); return; }
  closeColorPicker();
  pickerOpenTime = Date.now();

  const pop = document.createElement("div");
  pop._cell = cell;
  pop.style.cssText = `
    position:fixed; z-index:9999; display:flex; gap:6px; padding:8px;
    background:#1e1e1e; border:1px solid #3a3a3a; border-radius:10px;
    box-shadow:0 8px 32px rgba(0,0,0,0.7);
  `;

  ALL_COLORS.forEach(colorName => {
    const sw = document.createElement("div");
    sw.style.cssText = `width:30px;height:30px;border-radius:6px;border:2px solid transparent;cursor:pointer;background:${CUBE_COLORS[colorName].hex};`;
    sw.title = colorName;
    if (colorName === cell.dataset.color) sw.style.borderColor = "#fff";
    sw.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      cell.style.background = CUBE_COLORS[colorName].hex;
      cell.dataset.color    = colorName;
      if (faceData[faceKey]) faceData[faceKey][idx] = colorName;
      const r=Math.floor(idx/4), c=idx%4;
      faceHexGrid[FACE_IDX[faceKey]][r][c] = CUBE_COLORS[colorName].hex;
      closeColorPicker();
    });
    pop.appendChild(sw);
  });

  // Position — use fixed so it stays on screen
  const rect = cell.getBoundingClientRect();
  const popW = ALL_COLORS.length * 38 + 16;
  let left = rect.left;
  let top  = rect.bottom + 8;
  if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  if (top + 50 > window.innerHeight) top = rect.top - 58;
  pop.style.left = Math.max(8, left) + "px";
  pop.style.top  = top + "px";

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
    box.id = "err-box";
    box.style.cssText = "background:rgba(255,77,77,0.08);border:1px solid rgba(255,77,77,0.25);border-radius:10px;padding:1rem;font-size:0.85rem;color:#ff9090;margin-bottom:1rem;";
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
      showError(`Face ${letter} not scanned yet.`);
      solveBtn.innerHTML="✅  Solve the Cube!"; solveBtn.disabled=false; return;
    }
    for (const c of colors) stateStr += COLOR_TO_FACE[c];
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
    errBox.innerHTML = `<strong>Could not solve — colours may be wrong.</strong><br><br>Check the 3D cube and tap any wrong sticker to fix it, then try Solve again.`;
    document.getElementById("moves-wrap").appendChild(errBox);
    solveBtn.innerHTML="✅  Solve the Cube!"; solveBtn.disabled=false;
  }
});

function showSolution(algString) {
  const moves = algString.trim().split(/\s+/).filter(Boolean);
  document.getElementById("move-count").textContent = `${moves.length} moves`;
  const wrap = document.getElementById("moves-wrap");
  wrap.innerHTML = "";
  moves.forEach(m => {
    const chip = document.createElement("span");
    chip.className="move-chip"; chip.textContent=m;
    wrap.appendChild(chip);
  });
  document.getElementById("twisty").setAttribute("alg", algString);
  document.getElementById("twisty-wrap").style.display = "block";
  solutionArea.style.display = "block";
  solutionArea.scrollIntoView({behavior:"smooth"});
}

// ── RESET ─────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  currentShot = 1; analyzing = false;
  Object.keys(faceData).forEach(k => faceData[k] = null);
  faceHexGrid = Array.from({length:6},()=>Array.from({length:4},()=>Array(4).fill(DEFAULT_HEX)));

  document.querySelectorAll(".face-step").forEach((s,i) => {
    s.classList.remove("active","done");
    if (i===0) s.classList.add("active");
  });

  mainTitle.textContent  = "SHOT 1 OF 2";
  mainDesc.innerHTML     = SHOT_INSTRUCTIONS[1];
  faceNameEl.textContent = "Top corner";
  faceNumEl.textContent  = "0";

  captureBtn.disabled    = false;
  captureBtn.textContent = "📸  Capture Shot 1";
  solveRow.style.display = "none";
  solutionArea.style.display = "none";
  resetBtn.style.display = "none";
  solveBtn.innerHTML     = "✅  Solve the Cube!";
  solveBtn.disabled      = false;

  document.getElementById("twisty-wrap").style.display = "block";
  document.getElementById("move-count").textContent    = "";
  document.querySelectorAll("[data-shot]").forEach(el => el.remove());
  const errBox = document.getElementById("err-box");
  if (errBox) errBox.style.display = "none";

  const badge = document.getElementById("shot-badge");
  if (badge) { badge.textContent="SHOT 1 OF 2"; badge.style.background="var(--accent)"; badge.style.color="#000"; }
  const g1 = document.getElementById("guide-shot1");
  const g2 = document.getElementById("guide-shot2");
  if (g1) g1.style.display = "block";
  if (g2) g2.style.display = "none";
});
