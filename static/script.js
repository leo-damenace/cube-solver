// ═══════════════════════════════════════════════════════════
//  CubeSolve — script.js  v4
//  3D guide cube · Big face editor · Better colour detection
// ═══════════════════════════════════════════════════════════

// ── COLOUR DEFINITIONS ───────────────────────────────────
const CUBE_COLORS = {
  white:  { hex:"#f0f0f0", label:"White"  },
  yellow: { hex:"#ffd200", label:"Yellow" },
  red:    { hex:"#c41e1e", label:"Red"    },
  orange: { hex:"#ff6400", label:"Orange" },
  blue:   { hex:"#0046c8", label:"Blue"   },
  green:  { hex:"#009b2d", label:"Green"  },
};
const COLOR_NAMES = ["white","yellow","red","orange","blue","green"];

// ── FACE ORDER ────────────────────────────────────────────
// We ask the user to scan in this sequence relative to their first scan:
// 0=U(top), 1=F(front), 2=R(right), 3=B(back), 4=L(left), 5=D(bottom)
// The instructions guide them to rotate accordingly.
const SCAN_SEQUENCE = [
  { id:"U", label:"Any face",          instruction:"Hold any face towards camera and fill the grid." },
  { id:"F", label:"Rotate to front",   instruction:"Now rotate the cube so the BOTTOM of that face points toward you. Scan the face now facing the camera." },
  { id:"R", label:"Rotate right face", instruction:"Turn the cube 90° to the right. Scan the face now facing the camera." },
  { id:"B", label:"Opposite face",     instruction:"Turn the cube 90° right again. Scan the face now facing the camera." },
  { id:"L", label:"Last side face",    instruction:"Turn the cube 90° right once more. Scan the face now facing the camera." },
  { id:"D", label:"Bottom face",       instruction:"Flip the cube so the original scanned face now faces up. Scan the bottom face." },
];

// cubing.js expects: U R F D L B (indices into our faceColors array 0-5)
// Our order:          0 2 1 5 4 3
const CUBING_ORDER     = ["U","R","F","D","L","B"];
const OUR_IDX_FOR_FACE = { U:0, R:2, F:1, D:5, L:4, B:3 };
const COLOR_TO_FACE    = { white:"U", red:"R", green:"F", yellow:"D", orange:"L", blue:"B" };

// Guide cube alg strings — rotates the 3D guide to highlight the next face
// These are cube rotations shown in the guide player
const GUIDE_ROTATIONS = ["","x","x y","x y2","x y'","x2"];

// ── MOVE EXPLANATIONS ─────────────────────────────────────
const MOVE_EXPLANATIONS = {
  "U":   {name:"U — Up",          what:"Rotate the top layer 90° clockwise.",            why:"Moves top face pieces into position without disturbing the bottom two layers."},
  "U'":  {name:"U' — Up CCW",     what:"Rotate the top layer 90° counter-clockwise.",    why:"Undoes a U move, or repositions top pieces the other way."},
  "U2":  {name:"U2 — Up 180°",    what:"Rotate the top layer 180°.",                     why:"Swaps pieces on opposite sides of the top layer."},
  "D":   {name:"D — Down",        what:"Rotate the bottom layer 90° clockwise.",         why:"Moves bottom face pieces without touching the top two layers."},
  "D'":  {name:"D' — Down CCW",   what:"Rotate the bottom layer 90° counter-clockwise.", why:"Undoes a D move."},
  "D2":  {name:"D2 — Down 180°",  what:"Rotate the bottom layer 180°.",                  why:"Swaps pieces on opposite sides of the bottom."},
  "R":   {name:"R — Right",       what:"Rotate the right face 90° clockwise.",           why:"Shifts pieces between top, front, bottom and back on the right side."},
  "R'":  {name:"R' — Right CCW",  what:"Rotate the right face 90° counter-clockwise.",  why:"Undoes an R move."},
  "R2":  {name:"R2 — Right 180°", what:"Rotate the right face 180°.",                   why:"Swaps pieces on opposite sides of the right face."},
  "L":   {name:"L — Left",        what:"Rotate the left face 90° clockwise.",            why:"Mirrors R on the left side."},
  "L'":  {name:"L' — Left CCW",   what:"Rotate the left face 90° counter-clockwise.",   why:"Undoes an L move."},
  "L2":  {name:"L2 — Left 180°",  what:"Rotate the left face 180°.",                    why:"Swaps left face pieces."},
  "F":   {name:"F — Front",       what:"Rotate the front face 90° clockwise.",           why:"Moves pieces between top, right, bottom and left on the front."},
  "F'":  {name:"F' — Front CCW",  what:"Rotate the front face 90° counter-clockwise.",  why:"Undoes an F move."},
  "F2":  {name:"F2 — Front 180°", what:"Rotate the front face 180°.",                   why:"Swaps front face pieces."},
  "B":   {name:"B — Back",        what:"Rotate the back face 90° clockwise.",            why:"Like F but on the back."},
  "B'":  {name:"B' — Back CCW",   what:"Rotate the back face 90° counter-clockwise.",   why:"Undoes a B move."},
  "B2":  {name:"B2 — Back 180°",  what:"Rotate the back face 180°.",                    why:"Swaps back face pieces."},
  "Uw":  {name:"Uw — Wide Up",    what:"Rotate top TWO layers 90° clockwise.",           why:"4×4 specific — fixes inner edge parity unique to 4×4 cubes."},
  "Uw'": {name:"Uw' — Wide Up CCW",what:"Rotate top TWO layers 90° counter-clockwise.", why:"Undoes a Uw move."},
  "Uw2": {name:"Uw2 — Wide Up 180°",what:"Rotate top TWO layers 180°.",                  why:"Swaps inner edges that single-layer moves cannot fix."},
  "Dw":  {name:"Dw — Wide Down",  what:"Rotate bottom TWO layers 90° clockwise.",        why:"Repositions inner edges on the bottom half."},
  "Dw'": {name:"Dw' — Wide Down CCW",what:"Rotate bottom TWO layers 90° counter-clockwise.",why:"Undoes a Dw move."},
  "Dw2": {name:"Dw2 — Wide Down 180°",what:"Rotate bottom TWO layers 180°.",               why:"Fixes inner bottom edges."},
  "Rw":  {name:"Rw — Wide Right", what:"Rotate right TWO layers 90° clockwise.",         why:"Key for solving 4×4 centres and inner edges."},
  "Rw'": {name:"Rw' — Wide Right CCW",what:"Rotate right TWO layers 90° counter-clockwise.",why:"Undoes an Rw move."},
  "Rw2": {name:"Rw2 — Wide Right 180°",what:"Rotate right TWO layers 180°.",               why:"Swaps inner slice pieces on the right."},
  "Lw":  {name:"Lw — Wide Left",  what:"Rotate left TWO layers 90° clockwise.",          why:"Mirrors Rw on the left."},
  "Lw'": {name:"Lw' — Wide Left CCW",what:"Rotate left TWO layers 90° counter-clockwise.",why:"Undoes an Lw move."},
  "Lw2": {name:"Lw2 — Wide Left 180°",what:"Rotate left TWO layers 180°.",               why:"Swaps inner slice pieces on the left."},
  "Fw":  {name:"Fw — Wide Front", what:"Rotate front TWO layers 90° clockwise.",         why:"Moves inner edges on the front side."},
  "Fw'": {name:"Fw' — Wide Front CCW",what:"Rotate front TWO layers 90° counter-clockwise.",why:"Undoes an Fw move."},
  "Fw2": {name:"Fw2 — Wide Front 180°",what:"Rotate front TWO layers 180°.",              why:"Swaps inner front edges."},
  "Bw":  {name:"Bw — Wide Back",  what:"Rotate back TWO layers 90° clockwise.",          why:"Moves inner edges on the back side."},
  "Bw'": {name:"Bw' — Wide Back CCW",what:"Rotate back TWO layers 90° counter-clockwise.",why:"Undoes a Bw move."},
  "Bw2": {name:"Bw2 — Wide Back 180°",what:"Rotate back TWO layers 180°.",               why:"Swaps inner back edges."},
};

function explainMove(m) {
  return MOVE_EXPLANATIONS[m] || {name:m, what:"Perform the "+m+" move.", why:"Part of the solving algorithm."};
}

// ── STATE ─────────────────────────────────────────────────
let currentFace = 0;
let faceColors  = []; // array of 6, each is array of 16 colour name strings

// Editor state
let editorFaceIndex   = null;
let editorColors      = [];
let editorSelectedCell = null;
let editorActiveSwatch = null;
let editorActivePaintColor = COLOR_NAMES[0];

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
const solutionArea = document.getElementById("solution-area");
const facesRow     = document.getElementById("faces-row");
const faceNumEl    = document.getElementById("face-num");
const faceCountEl  = document.getElementById("face-counter");
const mainTitle    = document.getElementById("main-title");
const mainDesc     = document.getElementById("main-desc");
const guideWrap    = document.getElementById("guide-wrap");
const guideFaceLabel = document.getElementById("guide-face-label");
const guidePlayer  = document.getElementById("guide-player");
const faceEditor   = document.getElementById("face-editor");
const editorClose  = document.getElementById("editor-close");
const editorGrid   = document.getElementById("editor-grid");
const colourPalette = document.getElementById("colour-palette");
const editorDone   = document.getElementById("editor-done");
const editorTitle  = document.getElementById("editor-title");

// ── GATE ──────────────────────────────────────────────────
async function checkCode() {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  enterBtn.disabled = true;
  enterBtn.innerHTML = '<span class="spinner"></span> Checking...';
  try {
    const res  = await fetch("/verify-code", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});
    const data = await res.json();
    if (data.valid) {
      gateEl.style.display = "none";
      appEl.style.display  = "block";
      injectRestartBtn();
      startCamera();
    } else {
      gateError.textContent = "Invalid code.";
      codeInput.classList.add("shake");
      codeInput.addEventListener("animationend", ()=>codeInput.classList.remove("shake"),{once:true});
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
enterBtn.addEventListener("touchend", e=>{e.preventDefault();checkCode();});
codeInput.addEventListener("keydown", e=>{if(e.key==="Enter"){e.preventDefault();checkCode();}});
codeInput.addEventListener("input", ()=>{gateError.textContent="";});

// ── CAMERA ────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video:{facingMode:"environment",width:{ideal:1280},height:{ideal:960}}
    });
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", ()=>{syncOverlay(); drawGrid();});
    video.addEventListener("play", syncOverlay);
    window.addEventListener("resize", syncOverlay);
  } catch {
    alert("Camera access denied. Please allow camera permissions and reload.");
  }
}

function syncOverlay() {
  const rect = video.getBoundingClientRect();
  const s = Math.min(rect.width||400, rect.height||400);
  overlay.width  = s; overlay.height = s;
  overlay.style.width  = s+"px"; overlay.style.height = s+"px";
  overlay.style.left   = ((rect.width-s)/2)+"px";
  overlay.style.top    = ((rect.height-s)/2)+"px";
}

function drawGrid() {
  const s = overlay.width||400;
  const size = s*0.80, sx=(s-size)/2, sy=(s-size)/2, cell=size/4;
  ctx.clearRect(0,0,s,s);
  ctx.fillStyle="rgba(0,0,0,0.38)"; ctx.fillRect(0,0,s,s);
  ctx.clearRect(sx,sy,size,size);
  const corner=18;
  ctx.strokeStyle="#c8f135"; ctx.lineWidth=3; ctx.lineCap="round";
  [[sx,sy,1,1],[sx+size,sy,-1,1],[sx,sy+size,1,-1],[sx+size,sy+size,-1,-1]].forEach(([x,y,dx,dy])=>{
    ctx.beginPath(); ctx.moveTo(x+dx*corner,y); ctx.lineTo(x,y); ctx.lineTo(x,y+dy*corner); ctx.stroke();
  });
  ctx.strokeStyle="rgba(200,241,53,0.35)"; ctx.lineWidth=1;
  for(let i=1;i<4;i++){
    ctx.beginPath(); ctx.moveTo(sx+i*cell,sy); ctx.lineTo(sx+i*cell,sy+size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx,sy+i*cell); ctx.lineTo(sx+size,sy+i*cell); ctx.stroke();
  }
  requestAnimationFrame(drawGrid);
}

// ── COLOUR DETECTION (HSL-based) ─────────────────────────
function rgbToHsl(r,g,b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){h=s=0;}
  else {
    const d=max-min;
    s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){
      case r:h=((g-b)/d+(g<b?6:0))/6;break;
      case g:h=((b-r)/d+2)/6;break;
      case b:h=((r-g)/d+4)/6;break;
    }
  }
  return [h*360,s*100,l*100];
}

function closestColor(r,g,b) {
  const [h,s,l]=rgbToHsl(r,g,b);
  if(l>78&&s<20) return "white";
  if(s<18) return l>55?"white":"yellow";
  if(l>68&&h>40&&h<70) return "yellow";
  if(h>=0&&h<18)   return "red";
  if(h>=342&&h<=360) return "red";
  if(h>=18&&h<42)  return "orange";
  if(h>=42&&h<80)  return "yellow";
  if(h>=80&&h<165) return "green";
  if(h>=165&&h<258) return "blue";
  if(h>=258&&h<342) return "red";
  // euclidean fallback
  const RGB={white:[245,245,245],yellow:[255,210,0],red:[210,25,25],orange:[255,100,0],blue:[0,70,200],green:[0,155,45]};
  let best=null,bestD=Infinity;
  for(const [n,[cr,cg,cb]] of Object.entries(RGB)){
    const d=Math.sqrt((r-cr)**2+(g-cg)**2+(b-cb)**2);
    if(d<bestD){bestD=d;best=n;}
  }
  return best;
}

function sampleCell(sCtx,px,py) {
  const offsets=[[0,0],[4,0],[-4,0],[0,4],[0,-4],[3,3],[-3,-3],[3,-3],[-3,3]];
  const votes={};
  for(const [ox,oy] of offsets){
    const [r,g,b]=sCtx.getImageData(Math.max(0,px+ox),Math.max(0,py+oy),1,1).data;
    const c=closestColor(r,g,b);
    votes[c]=(votes[c]||0)+1;
  }
  return Object.entries(votes).sort((a,b)=>b[1]-a[1])[0][0];
}

function captureFaceColors() {
  const snap=document.createElement("canvas");
  snap.width=video.videoWidth||640; snap.height=video.videoHeight||480;
  snap.getContext("2d").drawImage(video,0,0);
  const w=snap.width,h=snap.height;
  const size=Math.min(w,h)*0.62, sx=(w-size)/2, sy=(h-size)/2, cell=size/4;
  const sCtx=snap.getContext("2d");
  const colors=[];
  for(let row=0;row<4;row++)
    for(let col=0;col<4;col++){
      const px=Math.floor(sx+col*cell+cell*0.5);
      const py=Math.floor(sy+row*cell+cell*0.5);
      colors.push(sampleCell(sCtx,px,py));
    }
  return colors;
}

// ── CAPTURE BUTTON ────────────────────────────────────────
captureBtn.addEventListener("click", ()=>{
  const colors = captureFaceColors();
  faceColors[currentFace] = colors;

  const steps = document.querySelectorAll(".face-step");
  steps[currentFace].classList.remove("active");
  steps[currentFace].classList.add("done");
  steps[currentFace].querySelector(".step-name").textContent =
    "✓ " + SCAN_SEQUENCE[currentFace].label;

  addFaceThumb(currentFace, colors);
  currentFace++;
  faceNumEl.textContent  = Math.min(currentFace+1, 6);
  faceCountEl.textContent = currentFace + " captured";

  if(currentFace < 6){
    steps[currentFace].classList.add("active");
    const seq = SCAN_SEQUENCE[currentFace];
    mainTitle.textContent = "SCAN FACE " + (currentFace+1) + " OF 6";
    mainDesc.textContent  = seq.instruction;

    // Update 3D guide
    guideWrap.style.display = "block";
    guideFaceLabel.textContent = seq.label;
    guidePlayer.setAttribute("experimental-setup-alg", GUIDE_ROTATIONS[currentFace]);
    guidePlayer.setAttribute("alg", "");
  } else {
    captureBtn.disabled    = true;
    captureBtn.textContent = "✅ All faces captured!";
    guideWrap.style.display = "none";
    solveRow.style.display  = "flex";
    mainTitle.textContent   = "READY TO SOLVE";
    mainDesc.innerHTML      = "All 6 faces scanned. <strong>Tap any face preview below to fix colours.</strong> Then press Solve.";
    faceNumEl.textContent   = "6";
  }
});

// ── FACE THUMBNAILS ───────────────────────────────────────
function initSlots() {
  facesRow.innerHTML="";
  for(let i=0;i<6;i++){
    const slot=document.createElement("div");
    slot.className="face-slot";
    slot.innerHTML=`<span class="face-slot-icon">◻</span>`;
    facesRow.appendChild(slot);
  }
}
initSlots();

function addFaceThumb(index, colors) {
  const allThumbs=facesRow.querySelectorAll(".face-thumb");
  const allSlots =facesRow.querySelectorAll(".face-slot");
  if(allThumbs[index]) allThumbs[index].remove();
  if(allSlots[index])  allSlots[index].remove();

  const wrap=document.createElement("div");
  wrap.className="face-thumb"; wrap.dataset.face=index;

  const grid=document.createElement("div");
  grid.className="mini-grid";
  colors.forEach(c=>{
    const cell=document.createElement("div");
    cell.className="mini-cell";
    cell.style.background=CUBE_COLORS[c].hex;
    grid.appendChild(cell);
  });

  const lbl=document.createElement("div");
  lbl.className="face-thumb-label";
  lbl.textContent="Face "+(index+1);

  wrap.appendChild(grid); wrap.appendChild(lbl);

  // Tap whole thumbnail to open full editor
  wrap.addEventListener("click",    ()=>openFaceEditor(index));
  wrap.addEventListener("touchend", e=>{e.preventDefault(); openFaceEditor(index);});

  facesRow.appendChild(wrap);
}

function refreshThumb(index) {
  const wrap = facesRow.querySelector(`.face-thumb[data-face="${index}"]`);
  if(!wrap) return;
  const cells = wrap.querySelectorAll(".mini-cell");
  faceColors[index].forEach((c,i)=>{ cells[i].style.background = CUBE_COLORS[c].hex; });
}

// ── FACE EDITOR (full-screen modal) ──────────────────────
function buildPalette() {
  colourPalette.innerHTML="";
  COLOR_NAMES.forEach(name=>{
    const sw=document.createElement("div");
    sw.className="palette-swatch";
    sw.style.background=CUBE_COLORS[name].hex;
    sw.textContent=CUBE_COLORS[name].label;
    if(name===editorActivePaintColor) sw.classList.add("active");
    sw.addEventListener("click",()=>{
      editorActivePaintColor=name;
      colourPalette.querySelectorAll(".palette-swatch").forEach(s=>s.classList.remove("active"));
      sw.classList.add("active");
      // If a cell is already selected, paint it immediately
      if(editorSelectedCell!==null){
        editorColors[editorSelectedCell]=name;
        const cells=editorGrid.querySelectorAll(".editor-cell");
        cells[editorSelectedCell].style.background=CUBE_COLORS[name].hex;
      }
    });
    colourPalette.appendChild(sw);
  });
}

function buildEditorGrid() {
  editorGrid.innerHTML="";
  editorColors.forEach((c,i)=>{
    const cell=document.createElement("div");
    cell.className="editor-cell";
    cell.style.background=CUBE_COLORS[c].hex;
    if(i===editorSelectedCell) cell.classList.add("selected");

    const tap = ()=>{
      // Paint immediately with active colour
      editorColors[i]=editorActivePaintColor;
      cell.style.background=CUBE_COLORS[editorActivePaintColor].hex;
      // Highlight selected
      editorGrid.querySelectorAll(".editor-cell").forEach(c=>c.classList.remove("selected"));
      cell.classList.add("selected");
      editorSelectedCell=i;
    };
    cell.addEventListener("click", tap);
    cell.addEventListener("touchend", e=>{e.preventDefault(); tap();});
    editorGrid.appendChild(cell);
  });
}

function openFaceEditor(index) {
  editorFaceIndex    = index;
  editorColors       = [...faceColors[index]];
  editorSelectedCell = null;
  editorTitle.textContent = "EDIT FACE " + (index+1);
  buildPalette();
  buildEditorGrid();
  faceEditor.classList.add("open");
  document.body.style.overflow="hidden";
}

function closeFaceEditor() {
  faceEditor.classList.remove("open");
  document.body.style.overflow="";
  editorFaceIndex=null;
}

editorClose.addEventListener("click", closeFaceEditor);
editorClose.addEventListener("touchend", e=>{e.preventDefault(); closeFaceEditor();});

editorDone.addEventListener("click", ()=>{
  if(editorFaceIndex!==null){
    faceColors[editorFaceIndex]=[...editorColors];
    refreshThumb(editorFaceIndex);
  }
  closeFaceEditor();
});
editorDone.addEventListener("touchend", e=>{
  e.preventDefault();
  if(editorFaceIndex!==null){
    faceColors[editorFaceIndex]=[...editorColors];
    refreshThumb(editorFaceIndex);
  }
  closeFaceEditor();
});

// ── SOLVE ─────────────────────────────────────────────────
solveBtn.addEventListener("click", async ()=>{
  solveBtn.innerHTML='<span class="spinner"></span> Solving...';
  solveBtn.disabled=true;

  let stateStr="";
  for(const letter of CUBING_ORDER){
    const ourIdx=OUR_IDX_FOR_FACE[letter];
    for(const colorName of faceColors[ourIdx]) stateStr+=COLOR_TO_FACE[colorName];
  }

  try {
    const {experimental4x4x4Solve}=await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution=await experimental4x4x4Solve(stateStr);
    showSolution(solution.toString());
  } catch(err) {
    console.error(err);
    solutionArea.style.display="block";
    document.getElementById("moves-wrap").innerHTML=`
      <div class="error-box">
        <strong>Could not solve — the cube state looks invalid.</strong><br><br>
        Tap any face preview above to open the editor and fix wrong colours. Make sure each colour appears exactly 16 times across all 6 faces. Then try Solve again.
      </div>`;
    document.getElementById("twisty-wrap").style.display="none";
    document.getElementById("move-count").textContent="";
    solveBtn.innerHTML="✅ Solve the Cube!";
    solveBtn.disabled=false;
  }
});

// ── SOLUTION + EXPLANATIONS ───────────────────────────────
function showSolution(algString) {
  const moves=algString.trim().split(/\s+/).filter(Boolean);
  document.getElementById("move-count").textContent=moves.length+" moves";

  const wrap=document.getElementById("moves-wrap");
  wrap.innerHTML="";

  const hint=document.createElement("p");
  hint.style.cssText="font-size:0.78rem;color:#555;margin-bottom:0.8rem;";
  hint.textContent="Tap any move to see what it does and why.";
  wrap.appendChild(hint);

  const chipsRow=document.createElement("div");
  chipsRow.style.cssText="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1.2rem;";

  const explainPanel=document.createElement("div");
  explainPanel.id="explain-panel";
  explainPanel.style.cssText="background:#161616;border:1px solid #2c2c2c;border-radius:10px;padding:1rem 1.2rem;margin-bottom:1rem;";

  let activeChip=null;

  moves.forEach((m,i)=>{
    const chip=document.createElement("span");
    chip.className="move-chip"; chip.textContent=m;
    const activate=()=>{
      if(activeChip){activeChip.style.background="";activeChip.style.color="";activeChip.style.borderColor="";}
      chip.style.background="#c8f135"; chip.style.color="#000"; chip.style.borderColor="#c8f135";
      activeChip=chip;
      renderExplanation(explainPanel,m,i,moves.length);
    };
    chip.addEventListener("click", activate);
    chip.addEventListener("touchend", e=>{e.preventDefault(); activate();});
    chipsRow.appendChild(chip);
  });

  wrap.appendChild(chipsRow);
  wrap.appendChild(explainPanel);

  // Auto-highlight first
  if(chipsRow.firstChild){
    chipsRow.firstChild.style.background="#c8f135";
    chipsRow.firstChild.style.color="#000";
    chipsRow.firstChild.style.borderColor="#c8f135";
    activeChip=chipsRow.firstChild;
  }
  renderExplanation(explainPanel,moves[0],0,moves.length);

  document.getElementById("twisty").setAttribute("alg",algString);
  document.getElementById("twisty-wrap").style.display="block";
  solutionArea.style.display="block";
  solutionArea.scrollIntoView({behavior:"smooth"});
}

function renderExplanation(panel,move,index,total){
  const info=explainMove(move);
  panel.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;">
      <span style="font-family:'DM Mono',monospace;font-size:1.2rem;color:#c8f135;font-weight:500;">${move}</span>
      <span style="font-size:0.7rem;color:#555;letter-spacing:1px;">MOVE ${index+1} OF ${total}</span>
    </div>
    <div style="font-size:0.78rem;color:#666;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:1px;">${info.name}</div>
    <div style="font-size:0.9rem;color:#efefef;margin-bottom:0.6rem;line-height:1.6;">&#x1F504; ${info.what}</div>
    <div style="font-size:0.85rem;color:#888;line-height:1.6;">&#x1F4A1; <em>${info.why}</em></div>
  `;
}

// ── RESTART ───────────────────────────────────────────────
function injectRestartBtn(){
  if(document.getElementById("top-restart-btn")) return;
  const btn=document.createElement("button");
  btn.id="top-restart-btn";
  btn.innerHTML="&#x21BA; Restart";
  btn.style.cssText="position:fixed;top:14px;right:16px;z-index:999;background:#1e1e1e;border:1px solid #3a3a3a;color:#888;border-radius:8px;padding:8px 16px;font-family:inherit;font-size:0.82rem;cursor:pointer;transition:color 0.15s,border-color 0.15s;touch-action:manipulation;";
  btn.addEventListener("mouseenter",()=>{btn.style.color="#c8f135";btn.style.borderColor="#c8f135";});
  btn.addEventListener("mouseleave",()=>{btn.style.color="#888";btn.style.borderColor="#3a3a3a";});
  btn.addEventListener("click", doRestart);
  btn.addEventListener("touchend",e=>{e.preventDefault();doRestart();});
  document.body.appendChild(btn);
}

function doRestart(){
  currentFace=0; faceColors=[];
  closeFaceEditor();

  document.querySelectorAll(".face-step").forEach((s,i)=>{
    s.classList.remove("active","done");
    s.querySelector(".step-name").textContent="Face "+(i+1);
    if(i===0) s.classList.add("active");
  });

  faceNumEl.textContent  ="1";
  faceCountEl.textContent="0 captured";
  mainTitle.textContent  ="SCAN ANY FACE FIRST";
  mainDesc.textContent   ="Hold any face of your cube towards the camera. Fill the yellow grid with the stickers, then press Capture.";

  captureBtn.disabled    =false;
  captureBtn.textContent ="📸 \u00a0Capture Face";
  guideWrap.style.display="none";
  solveRow.style.display ="none";
  solutionArea.style.display="none";

  solveBtn.innerHTML="✅ \u00a0Solve the Cube!";
  solveBtn.disabled =false;
  document.getElementById("twisty-wrap").style.display="block";
  document.getElementById("move-count").textContent="";

  initSlots();
  window.scrollTo({top:0,behavior:"smooth"});
}
