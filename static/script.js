// ── GATE (global so onclick in HTML can call it) ──────────
async function checkCode(){
  const codeInput = document.getElementById("code-input");
  const enterBtn  = document.getElementById("enter-btn");
  const gateError = document.getElementById("gate-error");
  const gateEl    = document.getElementById("gate");
  const appEl     = document.getElementById("app");

  const code = codeInput.value.trim().toUpperCase();
  if(!code) return;
  enterBtn.disabled=true;
  enterBtn.innerHTML='<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(0,0,0,0.2);border-top-color:#000;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle;margin-right:6px;"></span> Checking...';
  try {
    const res  = await fetch("/verify-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});
    const data = await res.json();
    if(data.valid){
      gateEl.style.display="none";
      appEl.style.display ="block";
      if(typeof injectRestartBtn === "function") injectRestartBtn();
      if(typeof startCamera     === "function") startCamera();
      if(typeof initThreeCube   === "function") initThreeCube();
      if(typeof initGuideCube   === "function") setTimeout(initGuideCube, 150);
    } else {
      gateError.textContent="Invalid code.";
      codeInput.style.borderColor="var(--red)";
      setTimeout(()=>codeInput.style.borderColor="",1500);
      enterBtn.disabled=false; enterBtn.textContent="Enter";
    }
  } catch(e) {
    gateError.textContent="Network error — try again.";
    enterBtn.disabled=false; enterBtn.textContent="Enter";
  }
}

document.addEventListener('DOMContentLoaded', function() {

// ═══════════════════════════════════════════════════════════
//  CubeSolve — script.js v5
//  Gemini AI colour reading · 2-shot vertex scanning
//  Three.js 3D cube preview · Big face editor
// ═══════════════════════════════════════════════════════════

// ── COLOURS ──────────────────────────────────────────────
const CUBE_COLORS = {
  white:  { hex:"#f0f0f0", label:"White",  threeHex:0xf0f0f0 },
  yellow: { hex:"#ffd200", label:"Yellow", threeHex:0xffd200 },
  red:    { hex:"#c41e1e", label:"Red",    threeHex:0xc41e1e },
  orange: { hex:"#ff6400", label:"Orange", threeHex:0xff6400 },
  blue:   { hex:"#0046c8", label:"Blue",   threeHex:0x0046c8 },
  green:  { hex:"#009b2d", label:"Green",  threeHex:0x009b2d },
};
const COLOR_NAMES = ["white","yellow","red","orange","blue","green"];

// ── FACE ORDER ────────────────────────────────────────────
// faceColors[0]=U, [1]=F, [2]=R, [3]=B, [4]=L, [5]=D
// Gemini shot 1 gives us: top→U, left→L, right→F  (looking at front-top-left corner)
// Gemini shot 2 gives us: bottom→D, left→R, right→B (looking at back-bottom-right corner)
const CUBING_ORDER     = ["U","R","F","D","L","B"];
const OUR_IDX_FOR_FACE = { U:0, R:2, F:1, D:5, L:4, B:3 };
const COLOR_TO_FACE    = { white:"U", red:"R", green:"F", yellow:"D", orange:"L", blue:"B" };

// Mapping from Gemini response keys to our face indices
// Shot 1: top→U(0), left→L(4), right→F(1)
// Shot 2: bottom→D(5), left→R(2), right→B(3)
const GEMINI_MAP = {
  first:  { top:0, left:4, right:1 },
  second: { bottom:5, left:2, right:3 },
};

// ── MOVE EXPLANATIONS ─────────────────────────────────────
const MOVE_EXP = {
  "U":   {n:"U — Up",          w:"Rotate top layer 90° clockwise.",            y:"Moves top pieces into position without disturbing lower layers."},
  "U'":  {n:"U' — Up CCW",     w:"Rotate top layer 90° counter-clockwise.",    y:"Undoes a U move."},
  "U2":  {n:"U2 — Up 180°",    w:"Rotate top layer 180°.",                     y:"Swaps pieces on opposite sides of the top."},
  "D":   {n:"D — Down",        w:"Rotate bottom layer 90° clockwise.",         y:"Moves bottom pieces without touching the top."},
  "D'":  {n:"D' — Down CCW",   w:"Rotate bottom layer 90° counter-clockwise.", y:"Undoes a D move."},
  "D2":  {n:"D2 — Down 180°",  w:"Rotate bottom layer 180°.",                  y:"Swaps bottom layer pieces."},
  "R":   {n:"R — Right",       w:"Rotate right face 90° clockwise.",           y:"Shifts pieces between top, front, bottom and back on the right."},
  "R'":  {n:"R' — Right CCW",  w:"Rotate right face 90° counter-clockwise.",  y:"Undoes an R move."},
  "R2":  {n:"R2 — Right 180°", w:"Rotate right face 180°.",                   y:"Swaps right face pieces."},
  "L":   {n:"L — Left",        w:"Rotate left face 90° clockwise.",            y:"Mirrors R on the left side."},
  "L'":  {n:"L' — Left CCW",   w:"Rotate left face 90° counter-clockwise.",   y:"Undoes an L move."},
  "L2":  {n:"L2 — Left 180°",  w:"Rotate left face 180°.",                    y:"Swaps left face pieces."},
  "F":   {n:"F — Front",       w:"Rotate front face 90° clockwise.",           y:"Moves pieces on the front side."},
  "F'":  {n:"F' — Front CCW",  w:"Rotate front face 90° counter-clockwise.",  y:"Undoes an F move."},
  "F2":  {n:"F2 — Front 180°", w:"Rotate front face 180°.",                   y:"Swaps front face pieces."},
  "B":   {n:"B — Back",        w:"Rotate back face 90° clockwise.",            y:"Like F but on the back."},
  "B'":  {n:"B' — Back CCW",   w:"Rotate back face 90° counter-clockwise.",   y:"Undoes a B move."},
  "B2":  {n:"B2 — Back 180°",  w:"Rotate back face 180°.",                    y:"Swaps back face pieces."},
  "Uw":  {n:"Uw — Wide Up",    w:"Rotate top TWO layers 90° clockwise.",       y:"4×4 specific — fixes inner edge parity."},
  "Uw'": {n:"Uw' — Wide Up CCW",w:"Rotate top TWO layers counter-clockwise.", y:"Undoes a Uw move."},
  "Uw2": {n:"Uw2 — Wide Up 180°",w:"Rotate top TWO layers 180°.",              y:"Swaps inner edges that single-layer moves can't fix."},
  "Dw":  {n:"Dw — Wide Down",  w:"Rotate bottom TWO layers 90° clockwise.",   y:"Repositions inner bottom edges."},
  "Dw'": {n:"Dw' — Wide Down CCW",w:"Rotate bottom TWO layers counter-clockwise.",y:"Undoes a Dw move."},
  "Dw2": {n:"Dw2 — Wide Down 180°",w:"Rotate bottom TWO layers 180°.",         y:"Fixes inner bottom edges."},
  "Rw":  {n:"Rw — Wide Right", w:"Rotate right TWO layers 90° clockwise.",    y:"Key for solving 4×4 centres."},
  "Rw'": {n:"Rw' — Wide Right CCW",w:"Rotate right TWO layers counter-clockwise.",y:"Undoes an Rw move."},
  "Rw2": {n:"Rw2 — Wide Right 180°",w:"Rotate right TWO layers 180°.",         y:"Swaps inner right slice pieces."},
  "Lw":  {n:"Lw — Wide Left",  w:"Rotate left TWO layers 90° clockwise.",     y:"Mirrors Rw on the left."},
  "Lw'": {n:"Lw' — Wide Left CCW",w:"Rotate left TWO layers counter-clockwise.",y:"Undoes an Lw move."},
  "Lw2": {n:"Lw2 — Wide Left 180°",w:"Rotate left TWO layers 180°.",           y:"Swaps inner left slice pieces."},
  "Fw":  {n:"Fw — Wide Front", w:"Rotate front TWO layers 90° clockwise.",    y:"Moves inner front edges."},
  "Fw'": {n:"Fw' — Wide Front CCW",w:"Rotate front TWO layers counter-clockwise.",y:"Undoes an Fw move."},
  "Fw2": {n:"Fw2 — Wide Front 180°",w:"Rotate front TWO layers 180°.",         y:"Swaps inner front edges."},
  "Bw":  {n:"Bw — Wide Back",  w:"Rotate back TWO layers 90° clockwise.",     y:"Moves inner back edges."},
  "Bw'": {n:"Bw' — Wide Back CCW",w:"Rotate back TWO layers counter-clockwise.",y:"Undoes a Bw move."},
  "Bw2": {n:"Bw2 — Wide Back 180°",w:"Rotate back TWO layers 180°.",           y:"Swaps inner back edges."},
};
function explainMove(m){ return MOVE_EXP[m]||{n:m,w:"Perform the "+m+" move.",y:"Part of the solving algorithm."}; }

// ── STATE ─────────────────────────────────────────────────
let currentShot = 0;          // 0 = first photo not taken, 1 = second, 2 = done
let faceColors  = Array(6).fill(null).map(()=>Array(16).fill("white"));
let photosTaken = [null, null]; // base64 of each photo
let activePaintColor = COLOR_NAMES[0];

// ── DOM ───────────────────────────────────────────────────
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
const editRow     = document.getElementById("edit-row");
const editBtn     = document.getElementById("edit-btn");
const solutionArea= document.getElementById("solution-area");
const shotNumEl   = document.getElementById("shot-num");
const statusBanner= document.getElementById("status-banner");
const mainTitle   = document.getElementById("main-title");
const mainDesc    = document.getElementById("main-desc");
const cubeLabel   = document.getElementById("cube-viewer-label");
const faceEditor  = document.getElementById("face-editor");
const editorClose = document.getElementById("editor-close");
const editorFacesWrap = document.getElementById("editor-faces-wrap");
const editorDone  = document.getElementById("editor-done");

// ── GATE ──────────────────────────────────────────────────
// checkCode is defined globally above DOMContentLoaded

// ── CAMERA ────────────────────────────────────────────────
async function startCamera(){
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video:{facingMode:"environment",width:{ideal:1280},height:{ideal:720}}
    });
    video.srcObject=stream;
    // iOS Safari requires manual play call
    video.addEventListener("loadedmetadata", async ()=>{
      try { await video.play(); } catch(e){ console.log('play error',e); }
    });
    window.addEventListener("resize", syncOverlay);
  } catch(err) {
    console.error('Camera error:', err);
    alert("Camera access denied. Please go to Settings > Safari > Camera and set to Allow, then reload.");
  }
}

function syncOverlay(){
  // Overlay is no longer used for drawing — Gemini reads the full photo
  // Just hide the canvas entirely
  overlay.style.display = "none";
}

// ── TAKE PHOTO ────────────────────────────────────────────
captureBtn.addEventListener("click", takePhoto);
captureBtn.addEventListener("touchend",e=>{e.preventDefault();takePhoto();});

async function takePhoto(){
  if(currentShot>=2) return;

  // Capture frame
  const snap=document.createElement("canvas");
  snap.width=video.videoWidth||1280; snap.height=video.videoHeight||720;
  snap.getContext("2d").drawImage(video,0,0);
  const b64=snap.toDataURL("image/jpeg",0.92).split(",")[1];
  photosTaken[currentShot]=b64;

  // Show preview
  const slot=document.getElementById(`photo-slot-${currentShot}`);
  slot.innerHTML=`<img src="data:image/jpeg;base64,${b64}"/><div class="photo-slot-label">Corner ${currentShot+1}</div>`;
  slot.classList.add("done");

  // Send to Gemini
  showBanner(`🤖 Gemini is reading the colours from photo ${currentShot+1}...`);
  captureBtn.disabled=true;
  captureBtn.innerHTML=`<span class="spinner"></span> Analysing...`;

  const cornerType = currentShot===0 ? "first" : "second";
  try {
    const res  = await fetch("/analyze-corner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({image:b64,corner:cornerType})});
    const data = await res.json();

    if(!data.ok){
      showBanner(`⚠️ Gemini error: ${data.error}. Try retaking the photo.`,"error");
      captureBtn.disabled=false; captureBtn.textContent="📸 Retake Photo";
      return;
    }

    // Map Gemini response to our faceColors array
    const map = GEMINI_MAP[cornerType];
    for(const [key,faceIdx] of Object.entries(map)){
      const geminiColors = data.faces[key];
      if(geminiColors && geminiColors.length===16){
        faceColors[faceIdx] = geminiColors.map(c=>c.toLowerCase().trim());
      }
    }

    updateThreeCube();

    if(currentShot===0){
      currentShot=1;
      shotNumEl.textContent="2";
      markStep(0,"done"); markStep(1,"active");
      mainTitle.textContent="NOW FLIP THE CUBE";
      mainDesc.textContent="Flip your cube over so you can see the 3 faces that were hidden. Point the camera at that opposite corner and take the second photo.";
      showBanner("✅ Photo 1 done! Gemini read 3 faces. Now flip and shoot the other corner.");
      captureBtn.disabled=false; captureBtn.textContent="📸 Take Photo 2";
    } else {
      currentShot=2;
      markStep(1,"done"); markStep(2,"active");
      mainTitle.textContent="ALL FACES SCANNED";
      mainDesc.innerHTML="Gemini has read all 6 faces. Review the colours below, then press Solve. <strong>Tap 'Review & Fix Colours'</strong> if anything looks wrong.";
      showBanner("✅ Both photos done! All 6 faces read. Review colours then hit Solve.");
      captureBtn.style.display="none";
      editRow.style.display="flex";
      solveRow.style.display="flex";
    }
    cubeLabel.textContent = currentShot>=2 ? "All 6 faces scanned" : `${currentShot} of 2 photos taken`;

  } catch(err){
    showBanner(`⚠️ Error: ${err.message}`,"error");
    captureBtn.disabled=false; captureBtn.textContent="📸 Retake Photo";
  }
}

function showBanner(msg, type="info"){
  statusBanner.style.display="block";
  statusBanner.style.background = type==="error" ? "rgba(255,77,77,0.08)" : "rgba(200,241,53,0.08)";
  statusBanner.style.borderColor= type==="error" ? "rgba(255,77,77,0.2)"  : "rgba(200,241,53,0.2)";
  statusBanner.style.color      = type==="error" ? "#ff9090"               : "var(--accent)";
  statusBanner.textContent=msg;
}

function markStep(i, state){
  const el=document.getElementById(`step-${i}`);
  if(!el) return;
  el.classList.remove("active","done");
  if(state) el.classList.add(state);
}

// ── THREE.JS 3D CUBE ──────────────────────────────────────
let threeScene, threeCamera, threeRenderer, threeCube, animFrameId;
// Face order for Three.js BoxGeometry material indices:
// 0=right(+X), 1=left(-X), 2=top(+Y), 3=bottom(-Y), 4=front(+Z), 5=back(-Z)
// Our face map: U=0,F=1,R=2,B=3,L=4,D=5
// Three.js sides:  R(2), L(4), U(0), D(5), F(1), B(3)
const THREE_FACE_MAP = [2,4,0,5,1,3]; // three.js index → our face index

function initThreeCube(){
  const canvas=document.getElementById("cube3d");
  if(!canvas||typeof THREE==="undefined") return;

  const w=canvas.parentElement.clientWidth||400;
  const h=240;
  canvas.width=w; canvas.height=h;

  threeScene   = new THREE.Scene();
  threeCamera  = new THREE.PerspectiveCamera(45,w/h,0.1,100);
  threeCamera.position.set(3.5,3,4);
  threeCamera.lookAt(0,0,0);

  threeRenderer= new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
  threeRenderer.setSize(w,h);
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  threeRenderer.setClearColor(0x1e1e1e,1);

  // Ambient + directional light
  threeScene.add(new THREE.AmbientLight(0xffffff,0.7));
  const dir=new THREE.DirectionalLight(0xffffff,0.8);
  dir.position.set(5,8,5); threeScene.add(dir);

  buildThreeCubelets();
  animateThree();

  window.addEventListener("resize",()=>{
    const nw=canvas.parentElement.clientWidth||400;
    threeCamera.aspect=nw/h; threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(nw,h);
  });
}

let cubelets = [];

function buildThreeCubelets(){
  // Remove old
  cubelets.forEach(c=>threeScene.remove(c));
  cubelets=[];

  const gap=1.05;
  for(let x=-1;x<=1;x++){
    for(let y=-1;y<=1;y++){
      for(let z=-1;z<=1;z++){
        const geo=new THREE.BoxGeometry(0.95,0.95,0.95);
        // 6 materials per cubelet face
        const mats=Array(6).fill(null).map(()=>
          new THREE.MeshLambertMaterial({color:0x222222})
        );
        const mesh=new THREE.Mesh(geo,mats);
        mesh.position.set(x*gap,y*gap,z*gap);
        mesh.userData={gx:x,gy:y,gz:z};
        threeScene.add(mesh);
        cubelets.push(mesh);
      }
    }
  }
  updateThreeCube();
}

function updateThreeCube(){
  // For each cubelet, figure out which outer faces are visible
  // and colour them according to faceColors
  const grey=0x2a2a2a;

  cubelets.forEach(mesh=>{
    const {gx,gy,gz}=mesh.userData;
    // Three.js material order: +X,-X,+Y,-Y,+Z,-Z
    // +X = Right face (our index 2), -X = Left (4), +Y = Up (0), -Y = Down (5), +Z = Front (1), -Z = Back (3)
    const faceAssign=[
      {ourFace:2, row:gz+1, col:1-gy},  // +X right
      {ourFace:4, row:gz+1, col:gy+1},  // -X left
      {ourFace:0, row:gz+1, col:gx+1},  // +Y up
      {ourFace:5, row:1-gz, col:gx+1},  // -Y down
      {ourFace:1, row:1-gy, col:gx+1},  // +Z front
      {ourFace:3, row:gy+1, col:1-gx},  // -Z back
    ];

    faceAssign.forEach(({ourFace,row,col},matIdx)=>{
      let color=grey;
      // Only colour if this cubelet is on the outer face
      const onFace = [
        gz===1,  // +X right: no wait, need different logic
      ];

      // Simpler: check if cubelet is on outer surface for this direction
      const isOuter=[gz===1,gx===-1,gy===1,gy===-1,gz===1,gz===-1];
      // Actually use position:
      const outer=[gx===1,gx===-1,gy===1,gy===-1,gz===1,gz===-1];
      if(outer[matIdx]){
        // Map this cubelet face to the correct sticker in faceColors
        const sticker=getStickerIndex(matIdx,gx,gy,gz);
        if(sticker!==-1 && faceColors[faceAssign[matIdx].ourFace]){
          const cname=faceColors[faceAssign[matIdx].ourFace][sticker];
          if(cname && CUBE_COLORS[cname]) color=CUBE_COLORS[cname].threeHex;
        }
      }
      mesh.material[matIdx].color.setHex(color);
    });
  });
}

function getStickerIndex(matIdx, gx, gy, gz){
  // Returns 0-15 sticker index for a cubelet face
  // Each face is 4×4, cubelets go from -1.5 to 1.5 (we use -1,0,1 so just 3 values — for 4x4 we fake 4 rows)
  // Since we're drawing a simplified 3x3 representation of a 4x4, map 3 positions to 4x4 quadrants
  // row/col → 0-3 index (split each position into 2)
  const map3to4=(v)=> v===-1?[0,1]: v===0?[1,2]:[2,3];

  switch(matIdx){
    case 0: { // +X right face: col=gz, row=gy (from top)
      const rows=map3to4(-gy), cols=map3to4(gz);
      return rows[0]*4+cols[0]; // simplified: use first quadrant
    }
    case 1: { // -X left face
      const rows=map3to4(-gy), cols=map3to4(-gz);
      return rows[0]*4+cols[0];
    }
    case 2: { // +Y up face: row=gz, col=gx
      const rows=map3to4(-gz), cols=map3to4(gx);
      return rows[0]*4+cols[0];
    }
    case 3: { // -Y down face
      const rows=map3to4(gz), cols=map3to4(gx);
      return rows[0]*4+cols[0];
    }
    case 4: { // +Z front face: row=gy, col=gx
      const rows=map3to4(-gy), cols=map3to4(gx);
      return rows[0]*4+cols[0];
    }
    case 5: { // -Z back face
      const rows=map3to4(-gy), cols=map3to4(-gx);
      return rows[0]*4+cols[0];
    }
  }
  return 0;
}

function animateThree(){
  animFrameId=requestAnimationFrame(animateThree);
  if(threeRenderer){
    // Slow auto-rotate
    cubelets.forEach(c=>{
      c.parent; // just reference
    });
    threeScene.rotation.y+=0.004;
    threeScene.rotation.x=0.25;
    threeRenderer.render(threeScene,threeCamera);
  }
}

// ── FACE EDITOR ───────────────────────────────────────────
const FACE_NAMES_EDITOR=["U — Top","F — Front","R — Right","B — Back","L — Left","D — Bottom"];

function openFaceEditor(){
  editorFacesWrap.innerHTML="";
  activePaintColor=COLOR_NAMES[0];

  faceColors.forEach((colors,faceIdx)=>{
    const section=document.createElement("div");
    section.className="editor-face-section";

    const lbl=document.createElement("div");
    lbl.className="editor-face-label";
    lbl.textContent=FACE_NAMES_EDITOR[faceIdx];
    section.appendChild(lbl);

    const grid=document.createElement("div");
    grid.className="editor-grid";

    colors.forEach((c,cellIdx)=>{
      const cell=document.createElement("div");
      cell.className="editor-cell";
      cell.style.background=CUBE_COLORS[c]?.hex||"#333";

      const paint=()=>{
        faceColors[faceIdx][cellIdx]=activePaintColor;
        cell.style.background=CUBE_COLORS[activePaintColor].hex;
        cell.classList.add("selected");
        setTimeout(()=>cell.classList.remove("selected"),300);
      };
      cell.addEventListener("click",paint);
      cell.addEventListener("touchend",e=>{e.preventDefault();paint();});
      grid.appendChild(cell);
    });
    section.appendChild(grid);

    // Per-face palette
    const palette=document.createElement("div");
    palette.className="colour-palette";
    COLOR_NAMES.forEach(name=>{
      const sw=document.createElement("div");
      sw.className="palette-swatch"+(name===activePaintColor?" active":"");
      sw.style.background=CUBE_COLORS[name].hex;
      sw.textContent=CUBE_COLORS[name].label;
      sw.addEventListener("click",()=>{
        activePaintColor=name;
        document.querySelectorAll(".palette-swatch").forEach(s=>s.classList.remove("active"));
        document.querySelectorAll(`.palette-swatch[data-color="${name}"]`).forEach(s=>s.classList.add("active"));
        sw.classList.add("active");
      });
      sw.dataset.color=name;
      palette.appendChild(sw);
    });
    section.appendChild(palette);
    editorFacesWrap.appendChild(section);
  });

  faceEditor.classList.add("open");
  document.body.style.overflow="hidden";
}

function closeFaceEditor(){
  faceEditor.classList.remove("open");
  document.body.style.overflow="";
  updateThreeCube();
}

editBtn.addEventListener("click",openFaceEditor);
editBtn.addEventListener("touchend",e=>{e.preventDefault();openFaceEditor();});
editorClose.addEventListener("click",closeFaceEditor);
editorClose.addEventListener("touchend",e=>{e.preventDefault();closeFaceEditor();});
editorDone.addEventListener("click",closeFaceEditor);
editorDone.addEventListener("touchend",e=>{e.preventDefault();closeFaceEditor();});

// ── SOLVE ─────────────────────────────────────────────────
solveBtn.addEventListener("click",async()=>{
  solveBtn.innerHTML='<span class="spinner"></span> Solving...';
  solveBtn.disabled=true;

  let stateStr="";
  for(const letter of CUBING_ORDER){
    const ourIdx=OUR_IDX_FOR_FACE[letter];
    for(const colorName of faceColors[ourIdx]) stateStr+=COLOR_TO_FACE[colorName]||"U";
  }

  try {
    const {experimental4x4x4Solve}=await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution=await experimental4x4x4Solve(stateStr);
    showSolution(solution.toString());
  } catch(err){
    console.error(err);
    document.getElementById("moves-wrap").innerHTML=`
      <div class="error-box">
        <strong>Could not solve.</strong> The cube state looks invalid.<br><br>
        Press <strong>Review & Fix Colours</strong> to correct any wrong stickers. Make sure each of the 6 colours appears exactly 16 times total.
      </div>`;
    document.getElementById("twisty-wrap").style.display="none";
    document.getElementById("move-count").textContent="";
    solutionArea.style.display="block";
    solveBtn.innerHTML="✅ Solve the Cube!"; solveBtn.disabled=false;
  }
});

function showSolution(algString){
  const moves=algString.trim().split(/\s+/).filter(Boolean);
  document.getElementById("move-count").textContent=moves.length+" moves";
  const wrap=document.getElementById("moves-wrap");
  wrap.innerHTML="";

  const hint=document.createElement("p");
  hint.style.cssText="font-size:.78rem;color:#555;margin-bottom:.8rem;";
  hint.textContent="Tap any move to see what it does and why.";
  wrap.appendChild(hint);

  const chipsRow=document.createElement("div");
  chipsRow.style.cssText="margin-bottom:1.2rem;";

  const panel=document.createElement("div");
  panel.id="explain-panel";
  panel.style.cssText="background:#161616;border:1px solid #2c2c2c;border-radius:10px;padding:1rem 1.2rem;margin-bottom:1rem;";

  let activeChip=null;
  moves.forEach((m,i)=>{
    const chip=document.createElement("span");
    chip.className="move-chip"; chip.textContent=m;
    const activate=()=>{
      if(activeChip){activeChip.style.background="";activeChip.style.color="";activeChip.style.borderColor="";}
      chip.style.background="#c8f135"; chip.style.color="#000"; chip.style.borderColor="#c8f135";
      activeChip=chip;
      renderExplanation(panel,m,i,moves.length);
    };
    chip.addEventListener("click",activate);
    chip.addEventListener("touchend",e=>{e.preventDefault();activate();});
    chipsRow.appendChild(chip);
  });

  wrap.appendChild(chipsRow); wrap.appendChild(panel);
  if(chipsRow.firstChild){
    chipsRow.firstChild.style.background="#c8f135";
    chipsRow.firstChild.style.color="#000";
    chipsRow.firstChild.style.borderColor="#c8f135";
    activeChip=chipsRow.firstChild;
    renderExplanation(panel,moves[0],0,moves.length);
  }

  document.getElementById("twisty").setAttribute("alg",algString);
  document.getElementById("twisty-wrap").style.display="block";
  solutionArea.style.display="block";
  solutionArea.scrollIntoView({behavior:"smooth"});
}

function renderExplanation(panel,move,index,total){
  const info=explainMove(move);
  panel.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;">
      <span style="font-family:'DM Mono',monospace;font-size:1.2rem;color:#c8f135;font-weight:500;">${move}</span>
      <span style="font-size:.7rem;color:#555;letter-spacing:1px;">MOVE ${index+1} OF ${total}</span>
    </div>
    <div style="font-size:.78rem;color:#666;margin-bottom:.5rem;text-transform:uppercase;letter-spacing:1px;">${info.n}</div>
    <div style="font-size:.9rem;color:#efefef;margin-bottom:.6rem;line-height:1.6;">&#x1F504; ${info.w}</div>
    <div style="font-size:.85rem;color:#888;line-height:1.6;">&#x1F4A1; <em>${info.y}</em></div>
  `;
}

// ── RESTART ───────────────────────────────────────────────
function injectRestartBtn(){
  if(document.getElementById("top-restart-btn")) return;
  const btn=document.createElement("button");
  btn.id="top-restart-btn";
  btn.innerHTML="&#x21BA; Restart";
  btn.style.cssText="position:fixed;top:14px;right:16px;z-index:999;background:#1e1e1e;border:1px solid #3a3a3a;color:#888;border-radius:8px;padding:8px 16px;font-family:inherit;font-size:.82rem;cursor:pointer;transition:color .15s,border-color .15s;touch-action:manipulation;";
  btn.addEventListener("mouseenter",()=>{btn.style.color="#c8f135";btn.style.borderColor="#c8f135";});
  btn.addEventListener("mouseleave",()=>{btn.style.color="#888";btn.style.borderColor="#3a3a3a";});
  btn.addEventListener("click",doRestart);
  btn.addEventListener("touchend",e=>{e.preventDefault();doRestart();});
  document.body.appendChild(btn);
}

function doRestart(){
  currentShot=0;
  faceColors=Array(6).fill(null).map(()=>Array(16).fill("white"));
  photosTaken=[null,null];
  activePaintColor=COLOR_NAMES[0];

  shotNumEl.textContent="1";
  mainTitle.textContent="POINT AT A CORNER";
  mainDesc.textContent="Hold your cube so you can see 3 faces at once — like looking at a corner. Take the photo when all 3 faces are clearly visible.";

  statusBanner.style.display="none";
  captureBtn.style.display=""; captureBtn.disabled=false; captureBtn.textContent="📸 \u00a0Take Photo";
  editRow.style.display="none"; solveRow.style.display="none"; solutionArea.style.display="none";
  cubeLabel.textContent="Waiting for scan...";

  document.getElementById("photo-slot-0").innerHTML='<div class="photo-slot-empty">Corner 1<br>not taken</div>';
  document.getElementById("photo-slot-1").innerHTML='<div class="photo-slot-empty">Corner 2<br>not taken</div>';
  document.getElementById("photo-slot-0").classList.remove("done");
  document.getElementById("photo-slot-1").classList.remove("done");

  solveBtn.innerHTML="✅ \u00a0Solve the Cube!"; solveBtn.disabled=false;
  document.getElementById("twisty-wrap").style.display="block";
  document.getElementById("move-count").textContent="";

  [0,1,2].forEach(i=>markStep(i,""));
  markStep(0,"active");

  updateThreeCube();
  window.scrollTo({top:0,behavior:"smooth"});

  // Reset guide animation
  document.getElementById("guide-anim-wrap").style.display  = "block";
  document.getElementById("cube-viewer-wrap").style.display = "none";
  document.getElementById("guide-anim-badge").textContent     = CORNER_TARGETS[0].badge;
  document.getElementById("guide-anim-label").textContent     = CORNER_TARGETS[0].label;
  document.getElementById("guide-anim-instruction").innerHTML = CORNER_TARGETS[0].instruction;
  guidePhase=0;
  guideTargetRotX=CORNER_TARGETS[0].rotX;
  guideTargetRotY=CORNER_TARGETS[0].rotY;
}

// ── GUIDE ANIMATION CUBE ──────────────────────────────────
// A separate Three.js scene showing a clean colourful cube
// rotating to highlight the corner the user should point at.

let guideScene, guideCamera, guideRenderer, guideAnimId;
let guideTargetRotX = 0.6;
let guideTargetRotY = 0.8;
let guideCurRotX    = 0.6;
let guideCurRotY    = 0.8;
let guidePhase      = 0; // 0=shot1, 1=shot2

// Standard solved cube colours for the guide (so it looks like a real cube)
const GUIDE_FACE_COLORS = {
  U: 0xffffff, // white top
  D: 0xffd200, // yellow bottom
  F: 0x009b2d, // green front
  B: 0x0046c8, // blue back
  R: 0xc41e1e, // red right
  L: 0xff6400, // orange left
};

// Corner 1: top-front-right corner → rotate to show U+F+R faces
// Corner 2: bottom-back-left corner → rotate to show D+B+L faces
const CORNER_TARGETS = [
  { rotX: 0.55, rotY: 0.75,  badge:"PHOTO 1 OF 2", label:"Point camera at this corner", instruction:"Hold your cube so you can see the <strong>Top, Front and Right</strong> faces at once — like this. Then take the photo." },
  { rotX:-0.55, rotY:-2.4,   badge:"PHOTO 2 OF 2", label:"Flip to opposite corner",     instruction:"Now flip your cube so the <strong>Bottom, Back and Left</strong> faces are visible. Match this angle, then take the photo." },
];

function initGuideCube() {
  const canvas = document.getElementById("guide3d");
  if (!canvas || typeof THREE === "undefined") return;

  const w = canvas.parentElement.clientWidth || 400;
  const h = 220;
  canvas.width = w; canvas.height = h;
  canvas.style.height = h + "px";

  guideScene  = new THREE.Scene();
  guideCamera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
  guideCamera.position.set(0, 0, 7);
  guideCamera.lookAt(0, 0, 0);

  guideRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  guideRenderer.setSize(w, h);
  guideRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  guideRenderer.setClearColor(0x1a1a1a, 1);

  guideScene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(4, 6, 5);
  guideScene.add(dir);

  buildGuideCubelets();
  animateGuide();

  window.addEventListener("resize", () => {
    const nw = canvas.parentElement.clientWidth || 400;
    guideCamera.aspect = nw / h;
    guideCamera.updateProjectionMatrix();
    guideRenderer.setSize(nw, h);
  });
}

let guideCubelets = [];
let guideCubeGroup;

function buildGuideCubelets() {
  guideCubeGroup = new THREE.Group();
  const gap = 1.04;

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const geo  = new THREE.BoxGeometry(0.94, 0.94, 0.94);
        const mats = [
          // +X right = R, -X left = L, +Y top = U, -Y bot = D, +Z front = F, -Z back = B
          new THREE.MeshLambertMaterial({ color: x === 1  ? GUIDE_FACE_COLORS.R : 0x1a1a1a }),
          new THREE.MeshLambertMaterial({ color: x === -1 ? GUIDE_FACE_COLORS.L : 0x1a1a1a }),
          new THREE.MeshLambertMaterial({ color: y === 1  ? GUIDE_FACE_COLORS.U : 0x1a1a1a }),
          new THREE.MeshLambertMaterial({ color: y === -1 ? GUIDE_FACE_COLORS.D : 0x1a1a1a }),
          new THREE.MeshLambertMaterial({ color: z === 1  ? GUIDE_FACE_COLORS.F : 0x1a1a1a }),
          new THREE.MeshLambertMaterial({ color: z === -1 ? GUIDE_FACE_COLORS.B : 0x1a1a1a }),
        ];
        const mesh = new THREE.Mesh(geo, mats);
        mesh.position.set(x * gap, y * gap, z * gap);
        guideCubeGroup.add(mesh);
        guideCubelets.push(mesh);
      }
    }
  }

  guideScene.add(guideCubeGroup);

  // Set initial rotation for corner 1
  guideCurRotX = CORNER_TARGETS[0].rotX;
  guideCurRotY = CORNER_TARGETS[0].rotY;
  guideTargetRotX = CORNER_TARGETS[0].rotX;
  guideTargetRotY = CORNER_TARGETS[0].rotY;
  guideCubeGroup.rotation.x = guideCurRotX;
  guideCubeGroup.rotation.y = guideCurRotY;
}

// Glow effect — pulses the 3 highlighted corner faces
let glowT = 0;
function updateGuideGlow() {
  glowT += 0.04;
  const pulse = 0.55 + 0.45 * Math.sin(glowT);

  const corner1Faces = [2, 4, 0]; // +X, +Y, +Z indices = R, U, F
  const corner2Faces = [1, 3, 5]; // -X, -Y, -Z indices = L, D, B
  const activeFaces  = guidePhase === 0 ? corner1Faces : corner2Faces;

  guideCubelets.forEach(mesh => {
    const p = mesh.position;
    const isCorner1 = p.x > 0 && p.y > 0 && p.z > 0;
    const isCorner2 = p.x < 0 && p.y < 0 && p.z < 0;
    const isActive  = guidePhase === 0 ? isCorner1 : isCorner2;

    mesh.material.forEach((mat, idx) => {
      const baseColors = [
        GUIDE_FACE_COLORS.R, GUIDE_FACE_COLORS.L,
        GUIDE_FACE_COLORS.U, GUIDE_FACE_COLORS.D,
        GUIDE_FACE_COLORS.F, GUIDE_FACE_COLORS.B,
      ];
      const onOuterFace = [p.x>0, p.x<0, p.y>0, p.y<0, p.z>0, p.z<0][idx];
      if (!onOuterFace) return;

      if (isActive && activeFaces.includes(idx)) {
        // Brighten the 3 active faces with pulse
        const base = new THREE.Color(baseColors[idx]);
        base.lerp(new THREE.Color(0xffffff), pulse * 0.35);
        mat.color.set(base);
        mat.emissive = new THREE.Color(baseColors[idx]);
        mat.emissiveIntensity = pulse * 0.25;
      } else if (!onOuterFace) {
        mat.color.setHex(0x1a1a1a);
      } else {
        mat.color.setHex(baseColors[idx]);
        mat.emissiveIntensity = 0;
      }
    });
  });
}

function animateGuide() {
  guideAnimId = requestAnimationFrame(animateGuide);
  if (!guideRenderer) return;

  // Smooth rotation towards target
  guideCurRotX += (guideTargetRotX - guideCurRotX) * 0.05;
  guideCurRotY += (guideTargetRotY - guideCurRotY) * 0.05;
  guideCubeGroup.rotation.x = guideCurRotX;
  guideCubeGroup.rotation.y = guideCurRotY;

  // Gentle idle bob
  guideCubeGroup.rotation.y += 0.003;
  guideTargetRotY += 0.003;

  updateGuideGlow();
  guideRenderer.render(guideScene, guideCamera);
}

function switchGuideToShot2() {
  guidePhase = 1;
  const t = CORNER_TARGETS[1];
  guideTargetRotX = t.rotX;
  guideTargetRotY = t.rotY;

  document.getElementById("guide-anim-badge").textContent       = t.badge;
  document.getElementById("guide-anim-label").textContent       = t.label;
  document.getElementById("guide-anim-instruction").innerHTML   = t.instruction;
}

function hideGuideShowCubeState() {
  document.getElementById("guide-anim-wrap").style.display  = "none";
  document.getElementById("cube-viewer-wrap").style.display = "block";
}

// Initialise guide when app loads
const _origCheckCode = checkCode;
// Hook into login success — initialise guide cube
const _origStartCamera = startCamera;
window._guideCubeReady = false;

// Patch: call initGuideCube after app becomes visible
const guideObserver = new MutationObserver(() => {
  if (appEl && appEl.style.display !== "none" && !window._guideCubeReady) {
    window._guideCubeReady = true;
    setTimeout(initGuideCube, 150);
    guideObserver.disconnect();
  }
});
if (appEl) guideObserver.observe(appEl, { attributes: true, attributeFilter: ["style"] });

// Patch takePhoto to switch guide after shot 1 and hide after shot 2
const _origTakePhoto = takePhoto;
window.takePhoto = async function() {
  await _origTakePhoto();
  if (currentShot === 1) {
    // Just finished shot 1 — switch guide to corner 2
    switchGuideToShot2();
  } else if (currentShot === 2) {
    // Just finished shot 2 — hide guide, show cube state
    hideGuideShowCubeState();
  }
};
// Reassign button listeners to new takePhoto
captureBtn.removeEventListener("click", takePhoto);
captureBtn.removeEventListener("touchend", takePhoto);
captureBtn.addEventListener("click", window.takePhoto);
captureBtn.addEventListener("touchend", e => { e.preventDefault(); window.takePhoto(); });


}); // end DOMContentLoaded
