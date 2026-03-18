// ═══════════════════════════════════════════════════
//  CubeSolve — script.js  (v3)
//  Better colour detection · Manual override
//  Restart without re-login · Move explanations
// ═══════════════════════════════════════════════════
 
const FACE_NAMES = ["White (Top)", "Green (Front)", "Red (Right)", "Blue (Back)", "Orange (Left)", "Yellow (Bottom)"];
const FACE_SHORT = ["Top", "Front", "Right", "Back", "Left", "Bottom"];
 
const CUBING_ORDER     = ["U","R","F","D","L","B"];
const OUR_IDX_FOR_FACE = { U:0, R:2, F:1, D:5, L:4, B:3 };
const COLOR_TO_FACE    = { white:"U", red:"R", green:"F", yellow:"D", orange:"L", blue:"B" };
const COLOR_NAMES      = ["white","yellow","red","orange","blue","green"];
 
const CUBE_COLORS = {
  white:  { r:245, g:245, b:245, hex:"#f5f5f5" },
  yellow: { r:255, g:210, b:  0, hex:"#ffd200" },
  red:    { r:210, g: 25, b: 25, hex:"#d21919" },
  orange: { r:255, g:100, b:  0, hex:"#ff6400" },
  blue:   { r:  0, g: 70, b:200, hex:"#0046c8" },
  green:  { r:  0, g:155, b: 45, hex:"#009b2d" },
};
 
const MOVE_EXPLANATIONS = {
  "U":   { name:"U — Up",          what:"Rotate the top layer 90° clockwise.",             why:"Moves pieces on the top face into position without disturbing the bottom two layers." },
  "U'":  { name:"U' — Up CCW",     what:"Rotate the top layer 90° counter-clockwise.",     why:"Undoes a U move, or repositions top layer pieces the other way." },
  "U2":  { name:"U2 — Up 180°",    what:"Rotate the top layer 180°.",                      why:"Swaps pieces on opposite sides of the top layer." },
  "D":   { name:"D — Down",        what:"Rotate the bottom layer 90° clockwise.",          why:"Moves pieces on the bottom face without touching the top two layers." },
  "D'":  { name:"D' — Down CCW",   what:"Rotate the bottom layer 90° counter-clockwise.", why:"Undoes a D move, or repositions bottom pieces the other way." },
  "D2":  { name:"D2 — Down 180°",  what:"Rotate the bottom layer 180°.",                  why:"Swaps pieces on opposite sides of the bottom layer." },
  "R":   { name:"R — Right",       what:"Rotate the right face 90° clockwise.",            why:"One of the most common moves — shifts pieces between top, front, bottom and back on the right side." },
  "R'":  { name:"R' — Right CCW",  what:"Rotate the right face 90° counter-clockwise.",   why:"Undoes an R move, essential in many algorithms." },
  "R2":  { name:"R2 — Right 180°", what:"Rotate the right face 180°.",                    why:"Swaps pieces on opposite sides of the right face." },
  "L":   { name:"L — Left",        what:"Rotate the left face 90° clockwise.",             why:"Mirrors the R move on the left side." },
  "L'":  { name:"L' — Left CCW",   what:"Rotate the left face 90° counter-clockwise.",    why:"Undoes an L move." },
  "L2":  { name:"L2 — Left 180°",  what:"Rotate the left face 180°.",                     why:"Swaps pieces on opposite sides of the left face." },
  "F":   { name:"F — Front",       what:"Rotate the front face 90° clockwise.",            why:"Moves pieces between the top, right, bottom and left on the front side." },
  "F'":  { name:"F' — Front CCW",  what:"Rotate the front face 90° counter-clockwise.",   why:"Undoes an F move." },
  "F2":  { name:"F2 — Front 180°", what:"Rotate the front face 180°.",                    why:"Swaps pieces on opposite sides of the front face." },
  "B":   { name:"B — Back",        what:"Rotate the back face 90° clockwise.",             why:"Like F but on the back — affects pieces you cannot directly see." },
  "B'":  { name:"B' — Back CCW",   what:"Rotate the back face 90° counter-clockwise.",    why:"Undoes a B move." },
  "B2":  { name:"B2 — Back 180°",  what:"Rotate the back face 180°.",                     why:"Swaps pieces on opposite sides of the back face." },
  "Uw":  { name:"Uw — Wide Up",        what:"Rotate the top TWO layers 90° clockwise.",           why:"4x4 specific. Moves inner edge pieces along with the top face — needed to fix parity errors unique to 4x4." },
  "Uw'": { name:"Uw' — Wide Up CCW",   what:"Rotate the top TWO layers 90° counter-clockwise.",   why:"Undoes a Uw move. Used to reposition inner edges." },
  "Uw2": { name:"Uw2 — Wide Up 180°",  what:"Rotate the top TWO layers 180°.",                    why:"Swaps inner edge pieces that cannot be fixed with single-layer moves." },
  "Dw":  { name:"Dw — Wide Down",      what:"Rotate the bottom TWO layers 90° clockwise.",         why:"Repositions inner edges on the bottom half of the cube." },
  "Dw'": { name:"Dw' — Wide Down CCW", what:"Rotate the bottom TWO layers 90° counter-clockwise.",why:"Undoes a Dw move." },
  "Dw2": { name:"Dw2 — Wide Down 180°",what:"Rotate the bottom TWO layers 180°.",                  why:"Fixes inner edge positions on the bottom." },
  "Rw":  { name:"Rw — Wide Right",     what:"Rotate the right TWO layers 90° clockwise.",          why:"4x4 specific. Moves the inner slice along with the right face — key for solving centres." },
  "Rw'": { name:"Rw' — Wide Right CCW",what:"Rotate the right TWO layers 90° counter-clockwise.", why:"Undoes an Rw move." },
  "Rw2": { name:"Rw2 — Wide Right 180°",what:"Rotate the right TWO layers 180°.",                  why:"Swaps inner slice pieces on the right side." },
  "Lw":  { name:"Lw — Wide Left",      what:"Rotate the left TWO layers 90° clockwise.",           why:"Mirrors Rw on the left side." },
  "Lw'": { name:"Lw' — Wide Left CCW", what:"Rotate the left TWO layers 90° counter-clockwise.",   why:"Undoes an Lw move." },
  "Lw2": { name:"Lw2 — Wide Left 180°",what:"Rotate the left TWO layers 180°.",                    why:"Swaps inner slice pieces on the left side." },
  "Fw":  { name:"Fw — Wide Front",     what:"Rotate the front TWO layers 90° clockwise.",           why:"Moves inner edges on the front side." },
  "Fw'": { name:"Fw' — Wide Front CCW",what:"Rotate the front TWO layers 90° counter-clockwise.",  why:"Undoes an Fw move." },
  "Fw2": { name:"Fw2 — Wide Front 180°",what:"Rotate the front TWO layers 180°.",                   why:"Swaps inner edge pieces on the front." },
  "Bw":  { name:"Bw — Wide Back",      what:"Rotate the back TWO layers 90° clockwise.",            why:"Moves inner edges on the back side." },
  "Bw'": { name:"Bw' — Wide Back CCW", what:"Rotate the back TWO layers 90° counter-clockwise.",   why:"Undoes a Bw move." },
  "Bw2": { name:"Bw2 — Wide Back 180°",what:"Rotate the back TWO layers 180°.",                    why:"Swaps inner edge pieces on the back." },
};
 
function explainMove(move) {
  return MOVE_EXPLANATIONS[move] || { name:move, what:"Perform the " + move + " move.", why:"Part of the solving algorithm." };
}
 
// ── STATE ────────────────────────────────────────────────
let currentFace = 0;
let faceColors  = [];
 
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
    const res  = await fetch("/verify-code", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({code}) });
    const data = await res.json();
    if (data.valid) {
      gateEl.style.display = "none";
      appEl.style.display  = "block";
      injectRestartBtn();
      startCamera();
    } else {
      gateError.textContent = "Invalid code — check with whoever sent it to you.";
      codeInput.classList.add("shake");
      codeInput.addEventListener("animationend", () => codeInput.classList.remove("shake"), { once:true });
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
enterBtn.addEventListener("touchend", e => { e.preventDefault(); checkCode(); });
codeInput.addEventListener("keydown", e => { if (e.key==="Enter") { e.preventDefault(); checkCode(); } });
codeInput.addEventListener("input",   () => { gateError.textContent = ""; });
 
// ── CAMERA ───────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode:"environment", width:{ideal:1280}, height:{ideal:960} }
    });
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", () => { syncOverlay(); drawGrid(); });
    video.addEventListener("play", syncOverlay);
    window.addEventListener("resize", syncOverlay);
  } catch {
    alert("Camera access denied. Please allow camera permissions and reload.");
  }
}
 
function syncOverlay() {
  const rect = video.getBoundingClientRect();
  const s = Math.min(rect.width || 400, rect.height || 400);
  overlay.width  = s;
  overlay.height = s;
  overlay.style.width  = s + "px";
  overlay.style.height = s + "px";
  overlay.style.left   = ((rect.width  - s) / 2) + "px";
  overlay.style.top    = ((rect.height - s) / 2) + "px";
}
 
function drawGrid() {
  const s    = overlay.width || 400;
  const size = s * 0.80;
  const sx   = (s - size) / 2;
  const sy   = (s - size) / 2;
  const cell = size / 4;
 
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(0, 0, s, s);
  ctx.clearRect(sx, sy, size, size);
 
  const corner = 18;
  ctx.strokeStyle = "#c8f135";
  ctx.lineWidth   = 3;
  ctx.lineCap     = "round";
  [[sx,sy,1,1],[sx+size,sy,-1,1],[sx,sy+size,1,-1],[sx+size,sy+size,-1,-1]].forEach(([x,y,dx,dy]) => {
    ctx.beginPath(); ctx.moveTo(x+dx*corner,y); ctx.lineTo(x,y); ctx.lineTo(x,y+dy*corner); ctx.stroke();
  });
 
  ctx.strokeStyle = "rgba(200,241,53,0.35)";
  ctx.lineWidth   = 1;
  for (let i=1; i<4; i++) {
    ctx.beginPath(); ctx.moveTo(sx+i*cell,sy); ctx.lineTo(sx+i*cell,sy+size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx,sy+i*cell); ctx.lineTo(sx+size,sy+i*cell); ctx.stroke();
  }
 
  requestAnimationFrame(drawGrid);
}
 
// ── IMPROVED COLOUR DETECTION ────────────────────────────
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return [h*360, s*100, l*100];
}
 
function closestColor(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
 
  if (l > 75 && s < 25) return "white";
  if (s < 15) return l > 55 ? "white" : "yellow";
  if (l > 70 && h > 40 && h < 70) return "yellow";
  if (h >= 0   && h < 20)  return "red";
  if (h >= 340 && h <= 360) return "red";
  if (h >= 20  && h < 45)  return "orange";
  if (h >= 45  && h < 80)  return "yellow";
  if (h >= 80  && h < 170) return "green";
  if (h >= 170 && h < 260) return "blue";
  if (h >= 260 && h < 340) return "red";
 
  let best = null, bestDist = Infinity;
  for (const [name, col] of Object.entries(CUBE_COLORS)) {
    const d = Math.sqrt((r-col.r)**2 + (g-col.g)**2 + (b-col.b)**2);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}
 
function sampleCell(sCtx, px, py) {
  const offsets = [[0,0],[3,0],[-3,0],[0,3],[0,-3],[2,2],[-2,-2]];
  const votes = {};
  for (const [ox,oy] of offsets) {
    const [r,g,b] = sCtx.getImageData(px+ox, py+oy, 1, 1).data;
    const c = closestColor(r,g,b);
    votes[c] = (votes[c]||0) + 1;
  }
  return Object.entries(votes).sort((a,b) => b[1]-a[1])[0][0];
}
 
function captureFaceColors() {
  const snap = document.createElement("canvas");
  snap.width  = video.videoWidth  || 640;
  snap.height = video.videoHeight || 480;
  snap.getContext("2d").drawImage(video, 0, 0);
 
  const w = snap.width, h = snap.height;
  const size = Math.min(w,h) * 0.62;
  const sx   = (w - size) / 2;
  const sy   = (h - size) / 2;
  const cell = size / 4;
  const sCtx = snap.getContext("2d");
 
  const colors = [];
  for (let row=0; row<4; row++) {
    for (let col=0; col<4; col++) {
      const px = Math.floor(sx + col*cell + cell*0.5);
      const py = Math.floor(sy + row*cell + cell*0.5);
      colors.push(sampleCell(sCtx, px, py));
    }
  }
  return colors;
}
 
// ── CAPTURE ──────────────────────────────────────────────
captureBtn.addEventListener("click", () => {
  const colors = captureFaceColors();
  faceColors[currentFace] = colors;
 
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
  } else {
    captureBtn.disabled    = true;
    captureBtn.textContent = "All faces captured!";
    solveRow.style.display = "flex";
    mainTitle.textContent  = "READY TO SOLVE";
    mainDesc.innerHTML     = `All 6 faces scanned. <strong>Tap any coloured square below to fix a wrong colour</strong>, then press Solve.`;
    faceNameEl.textContent = "Done";
  }
});
 
// ── FACE THUMBNAILS with tap-to-edit ─────────────────────
function addFaceThumb(index, colors) {
  const allThumbs = facesRow.querySelectorAll(".face-thumb");
  const allSlots  = facesRow.querySelectorAll(".face-slot");
  if (allThumbs[index]) allThumbs[index].remove();
  if (allSlots[index])  allSlots[index].remove();
 
  const wrap = document.createElement("div");
  wrap.className    = "face-thumb";
  wrap.dataset.face = index;
 
  const grid = document.createElement("div");
  grid.className = "mini-grid";
 
  colors.forEach((c, i) => {
    const cell = document.createElement("div");
    cell.className        = "mini-cell";
    cell.style.background = CUBE_COLORS[c].hex;
    cell.style.cursor     = "pointer";
    cell.title            = "Tap to fix colour";
    cell.addEventListener("click",    ()  => openColorPicker(index, i, cell));
    cell.addEventListener("touchend", e   => { e.preventDefault(); openColorPicker(index, i, cell); });
    grid.appendChild(cell);
  });
 
  const lbl = document.createElement("div");
  lbl.className   = "face-thumb-label";
  lbl.textContent = FACE_SHORT[index];
 
  wrap.appendChild(grid);
  wrap.appendChild(lbl);
  facesRow.appendChild(wrap);
}
 
// ── COLOUR PICKER POPUP ───────────────────────────────────
function openColorPicker(faceIndex, cellIndex, cellEl) {
  document.getElementById("color-picker-popup")?.remove();
 
  const popup = document.createElement("div");
  popup.id = "color-picker-popup";
  popup.style.cssText = "position:fixed;z-index:9999;background:#1e1e1e;border:1px solid #3a3a3a;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,0.7);min-width:200px;";
 
  const label = document.createElement("div");
  label.textContent  = "Pick the correct colour:";
  label.style.cssText = "font-size:0.72rem;color:#888;letter-spacing:1px;text-transform:uppercase;";
  popup.appendChild(label);
 
  const swatches = document.createElement("div");
  swatches.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center;";
 
  COLOR_NAMES.forEach(colorName => {
    const sw = document.createElement("div");
    const isCurrent = faceColors[faceIndex][cellIndex] === colorName;
    sw.style.cssText = `width:40px;height:40px;border-radius:8px;background:${CUBE_COLORS[colorName].hex};cursor:pointer;border:3px solid ${isCurrent ? "#c8f135" : "transparent"};transform:${isCurrent ? "scale(1.15)" : "scale(1)"};transition:border-color 0.15s,transform 0.1s;`;
    sw.title = colorName;
    sw.addEventListener("click", () => {
      faceColors[faceIndex][cellIndex] = colorName;
      cellEl.style.background = CUBE_COLORS[colorName].hex;
      popup.remove();
    });
    swatches.appendChild(sw);
  });
 
  popup.appendChild(swatches);
 
  const cancel = document.createElement("button");
  cancel.textContent  = "Cancel";
  cancel.style.cssText = "background:transparent;border:1px solid #3a3a3a;color:#888;border-radius:8px;padding:7px;font-family:inherit;font-size:0.8rem;cursor:pointer;";
  cancel.addEventListener("click", () => popup.remove());
  popup.appendChild(cancel);
 
  document.body.appendChild(popup);
 
  const rect = cellEl.getBoundingClientRect();
  let top  = rect.bottom + 10;
  let left = rect.left - 80 + rect.width/2;
  left = Math.max(8, Math.min(left, window.innerWidth  - 216));
  top  = Math.max(8, Math.min(top,  window.innerHeight - 160));
  popup.style.top  = top  + "px";
  popup.style.left = left + "px";
 
  setTimeout(() => {
    document.addEventListener("click", function outside(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener("click", outside); }
    });
  }, 100);
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
    document.getElementById("moves-wrap").innerHTML = `<div class="error-box"><strong>Could not solve — colours may have been misread.</strong><br><br>Tap any wrong square in the preview to fix its colour, then try Solve again. Or press Restart to scan fresh.</div>`;
    document.getElementById("twisty-wrap").style.display = "none";
    document.getElementById("move-count").textContent    = "";
    solveBtn.innerHTML = "Solve the Cube!";
    solveBtn.disabled  = false;
  }
});
 
// ── SOLUTION + EXPLANATIONS ───────────────────────────────
function showSolution(algString) {
  const moves = algString.trim().split(/\s+/).filter(Boolean);
  document.getElementById("move-count").textContent = `${moves.length} moves`;
 
  const wrap = document.getElementById("moves-wrap");
  wrap.innerHTML = "";
 
  const hint = document.createElement("p");
  hint.style.cssText = "font-size:0.78rem;color:#555;margin-bottom:0.8rem;";
  hint.textContent   = "Tap any move chip below to see what it does and why.";
  wrap.appendChild(hint);
 
  const chipsRow = document.createElement("div");
  chipsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;margin-bottom:1.2rem;";
 
  const explainPanel = document.createElement("div");
  explainPanel.id = "explain-panel";
  explainPanel.style.cssText = "background:#161616;border:1px solid #2c2c2c;border-radius:10px;padding:1rem 1.2rem;margin-bottom:1rem;";
 
  let activeChip = null;
 
  moves.forEach((m, i) => {
    const chip = document.createElement("span");
    chip.className   = "move-chip";
    chip.textContent = m;
    chip.style.cursor = "pointer";
 
    chip.addEventListener("click", () => {
      if (activeChip) { activeChip.style.background=""; activeChip.style.color=""; activeChip.style.borderColor=""; }
      chip.style.background   = "#c8f135";
      chip.style.color        = "#000";
      chip.style.borderColor  = "#c8f135";
      activeChip = chip;
      renderExplanation(explainPanel, m, i, moves.length);
    });
 
    chipsRow.appendChild(chip);
  });
 
  wrap.appendChild(chipsRow);
  wrap.appendChild(explainPanel);
 
  // Auto-highlight first move
  if (chipsRow.firstChild) {
    chipsRow.firstChild.style.background  = "#c8f135";
    chipsRow.firstChild.style.color       = "#000";
    chipsRow.firstChild.style.borderColor = "#c8f135";
    activeChip = chipsRow.firstChild;
  }
  renderExplanation(explainPanel, moves[0], 0, moves.length);
 
  const twisty = document.getElementById("twisty");
  twisty.setAttribute("alg", algString);
  document.getElementById("twisty-wrap").style.display = "block";
 
  solutionArea.style.display = "block";
  solutionArea.scrollIntoView({ behavior:"smooth" });
}
 
function renderExplanation(panel, move, index, total) {
  const info = explainMove(move);
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;">
      <span style="font-family:'DM Mono',monospace;font-size:1.2rem;color:#c8f135;font-weight:500;">${move}</span>
      <span style="font-size:0.7rem;color:#555;letter-spacing:1px;">MOVE ${index+1} OF ${total}</span>
    </div>
    <div style="font-size:0.78rem;color:#666;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:1px;">${info.name}</div>
    <div style="font-size:0.9rem;color:#efefef;margin-bottom:0.6rem;line-height:1.6;">&#x1F504; ${info.what}</div>
    <div style="font-size:0.85rem;color:#888;line-height:1.6;">&#x1F4A1; <em>${info.why}</em></div>
  `;
}
 
// ── RESTART BUTTON ────────────────────────────────────────
function injectRestartBtn() {
  if (document.getElementById("top-restart-btn")) return;
  const btn = document.createElement("button");
  btn.id        = "top-restart-btn";
  btn.innerHTML = "&#x21BA; Restart";
  btn.style.cssText = "position:fixed;top:14px;right:16px;z-index:999;background:#1e1e1e;border:1px solid #3a3a3a;color:#888;border-radius:8px;padding:8px 16px;font-family:inherit;font-size:0.82rem;cursor:pointer;transition:color 0.15s,border-color 0.15s;touch-action:manipulation;";
  btn.addEventListener("mouseenter", () => { btn.style.color="#c8f135"; btn.style.borderColor="#c8f135"; });
  btn.addEventListener("mouseleave", () => { btn.style.color="#888";    btn.style.borderColor="#3a3a3a"; });
  btn.addEventListener("click",    doRestart);
  btn.addEventListener("touchend", e => { e.preventDefault(); doRestart(); });
  document.body.appendChild(btn);
}
 
function doRestart() {
  currentFace = 0;
  faceColors  = [];
  document.getElementById("color-picker-popup")?.remove();
 
  document.querySelectorAll(".face-step").forEach((s,i) => {
    s.classList.remove("active","done");
    if (i===0) s.classList.add("active");
  });
 
  faceNameEl.textContent = FACE_NAMES[0];
  faceNumEl.textContent  = "0";
  mainTitle.textContent  = "SCAN FACE 1 OF 6";
  mainDesc.innerHTML     = `Hold the <strong>White (Top)</strong> face up to the camera, then press Capture.`;
 
  captureBtn.disabled    = false;
  captureBtn.textContent = "Capture Face";
 
  solveRow.style.display     = "none";
  solutionArea.style.display = "none";
  resetBtn.style.display     = "none";
 
  solveBtn.innerHTML = "Solve the Cube!";
  solveBtn.disabled  = false;
 
  document.getElementById("twisty-wrap").style.display = "block";
  document.getElementById("move-count").textContent    = "";
 
  initSlots();
  window.scrollTo({ top:0, behavior:"smooth" });
}
