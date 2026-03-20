// Global camera function
async function startCamera(){
  const video = document.getElementById("camera");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    video.play();
    video.addEventListener("playing", ()=>{
      syncOverlay();
      drawYGuide();
    }, { once: true });
    window.addEventListener("resize", syncOverlay);
  } catch(err) {
    alert("Camera error: " + err.message + ". Go to Settings > Safari > Camera > Allow.");
  }
}

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
let currentShot = 0;
let isAnalysing = false;  // blocks photo during Gemini analysis          // 0 = first photo not taken, 1 = second, 2 = done
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
const overlay = document.getElementById("overlay");
const ctx = overlay ? overlay.getContext("2d") : null;
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
// startCamera defined globally above

function syncOverlay(){
  const ov  = document.getElementById("overlay");
  const vid = document.getElementById("camera");
  if(!ov || !vid) return;
  const rect = vid.getBoundingClientRect();
  ov.width  = rect.width  || 400;
  ov.height = rect.height || 400;
  ov.style.width  = ov.width  + "px";
  ov.style.height = ov.height + "px";
}

function drawYGuide(){
  const ov = document.getElementById("overlay");
  if(!ov) return;
  const c = ov.getContext("2d");
  const W = ov.width  || 400;
  const H = ov.height || 400;
  c.clearRect(0, 0, W, H);

  // Hardcoded isometric cube — front corner points at camera
  // Cube sits in upper-centre of frame
  // All measurements as fractions of the shorter side
  const u = Math.min(W, H) * 0.22; // unit size
  const cx = W * 0.5;
  const cy = H * 0.42;

  // 7 key points — isometric projection
  // Front corner = the point closest to camera
  const fc  = {x: cx,       y: cy        };  // front corner (centre dot)
  const top = {x: cx,       y: cy - u*2  };  // top vertex
  const ml  = {x: cx - u*1.73, y: cy - u };  // mid-left
  const mr  = {x: cx + u*1.73, y: cy - u };  // mid-right
  const bl  = {x: cx - u*1.73, y: cy + u };  // bottom-left
  const br  = {x: cx + u*1.73, y: cy + u };  // bottom-right
  const bot = {x: cx,       y: cy + u*2  };  // bottom vertex (not shown)

  // 3 faces:
  // TOP face:   top → mr → fc → ml
  // LEFT face:  ml  → fc → bl → farL   where farL = ml shifted down
  // RIGHT face: fc  → mr → farR → br   where farR = mr shifted down
  const farL = {x: cx - u*1.73, y: cy + u};  // = bl
  const farR = {x: cx + u*1.73, y: cy + u};  // = br

  // Actually the 3 faces of an isometric cube from front:
  // TOP:   top, mr, fc, ml
  // LEFT:  ml, fc, bl, {x:ml.x+(bl.x-fc.x), y:ml.y+(bl.y-fc.y)}
  // RIGHT: fc, mr, {x:mr.x+(br.x-fc.x), y:mr.y+(br.y-fc.y)}, br

  const leftFar  = {x: ml.x + (bl.x - fc.x), y: ml.y + (bl.y - fc.y)};
  const rightFar = {x: mr.x + (br.x - fc.x), y: mr.y + (br.y - fc.y)};

  // Dim outside
  c.fillStyle = "rgba(0,0,0,0.25)";
  c.fillRect(0, 0, W, H);

  // Face fills
  function face(pts, col){
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for(let i=1;i<pts.length;i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    c.fillStyle = col; c.fill();
  }
  face([top, mr, fc, ml],             "rgba(200,241,53,0.08)");
  face([ml, fc, bl, leftFar],         "rgba(80,180,255,0.08)");
  face([fc, mr, rightFar, br],        "rgba(255,140,40,0.08)");

  // Grid helper
  function grid4(A, B, CC, D){
    c.strokeStyle = "rgba(200,241,53,0.5)";
    c.lineWidth = 0.8;
    for(let i=1;i<4;i++){
      const t=i/4;
      const p1={x:A.x+(D.x-A.x)*t, y:A.y+(D.y-A.y)*t};
      const p2={x:B.x+(CC.x-B.x)*t, y:B.y+(CC.y-B.y)*t};
      c.beginPath(); c.moveTo(p1.x,p1.y); c.lineTo(p2.x,p2.y); c.stroke();
      const p3={x:A.x+(B.x-A.x)*t, y:A.y+(B.y-A.y)*t};
      const p4={x:D.x+(CC.x-D.x)*t, y:D.y+(CC.y-D.y)*t};
      c.beginPath(); c.moveTo(p3.x,p3.y); c.lineTo(p4.x,p4.y); c.stroke();
    }
  }

  grid4(top, mr, fc, ml);
  grid4(ml, fc, bl, leftFar);
  grid4(fc, mr, rightFar, br);

  // Bold outlines
  c.strokeStyle = "#c8f135";
  c.lineWidth = 2.5;
  c.lineJoin = "round";
  c.lineCap  = "round";

  // Top face
  c.beginPath();
  c.moveTo(top.x,top.y); c.lineTo(mr.x,mr.y);
  c.lineTo(fc.x,fc.y);   c.lineTo(ml.x,ml.y);
  c.closePath(); c.stroke();

  // Left face
  c.beginPath();
  c.moveTo(ml.x,ml.y);       c.lineTo(leftFar.x,leftFar.y);
  c.lineTo(bl.x,bl.y);       c.lineTo(fc.x,fc.y);
  c.closePath(); c.stroke();

  // Right face
  c.beginPath();
  c.moveTo(fc.x,fc.y);         c.lineTo(mr.x,mr.y);
  c.lineTo(rightFar.x,rightFar.y); c.lineTo(br.x,br.y);
  c.closePath(); c.stroke();

  // Front corner dot
  c.beginPath(); c.arc(fc.x,fc.y,7,0,Math.PI*2);
  c.fillStyle="#fff"; c.fill();
  c.beginPath(); c.arc(fc.x,fc.y,4,0,Math.PI*2);
  c.fillStyle="#c8f135"; c.fill();

  // Labels
  c.font = `bold ${Math.floor(W*0.032)}px DM Sans,sans-serif`;
  c.fillStyle = "#c8f135";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("TOP",   top.x, top.y-16);
  c.fillText("LEFT",  leftFar.x-24, (ml.y+leftFar.y)/2);
  c.fillText("RIGHT", rightFar.x+28, (mr.y+rightFar.y)/2);

  // Instruction
  c.fillStyle = "rgba(255,255,255,0.8)";
  c.font = `${Math.floor(W*0.032)}px DM Sans,sans-serif`;
  c.textAlign = "center"; c.textBaseline = "bottom";
  c.fillText("Align front corner to the dot", W/2, H-10);

  requestAnimationFrame(drawYGuide);
}

// ── TAKE PHOTO ────────────────────────────────────────────
captureBtn.addEventListener("click", takePhoto);
captureBtn.addEventListener("touchend",e=>{e.preventDefault();takePhoto();});

async function takePhoto(){
  if(isAnalysing) return;
  const btn     = document.getElementById("capture-btn");
  const vidEl   = document.getElementById("camera");
  const slot0   = document.getElementById("photo-slot-0");
  const slot1   = document.getElementById("photo-slot-1");

  if(currentShot >= 2) return;

  // Capture and compress frame
  const snap = document.createElement("canvas");
  const maxW = 800;
  const scale = Math.min(1, maxW / (vidEl.videoWidth || 1280));
  snap.width  = Math.floor((vidEl.videoWidth  || 1280) * scale);
  snap.height = Math.floor((vidEl.videoHeight || 720)  * scale);
  snap.getContext("2d").drawImage(vidEl, 0, 0, snap.width, snap.height);
  const b64 = snap.toDataURL("image/jpeg", 0.8).split(",")[1];

  const shotIndex = currentShot;
  photosTaken[shotIndex] = b64;

  // Show preview
  const slot = shotIndex === 0 ? slot0 : slot1;
  slot.innerHTML = `<img src="data:image/jpeg;base64,${b64}"/><div class="photo-slot-label">Corner ${shotIndex+1}</div>`;
  slot.classList.add("done");

  if(shotIndex === 0){
    // First photo taken — just save it, ask for second
    currentShot = 1;
    document.getElementById("shot-num").textContent = "2";
    markStep(0,"done"); markStep(1,"active");
    document.getElementById("main-title").textContent = "NOW FLIP THE CUBE";
    document.getElementById("main-desc").textContent  = "Flip to the opposite corner so the other 3 faces are visible. Take the second photo.";
    showBanner("✅ Photo 1 saved! Flip the cube and take photo 2.");
    btn.disabled    = false;
    btn.textContent = "📸 Take Photo 2";
    btn.onclick     = takePhoto;
    if(typeof switchGuideToShot2 === "function") switchGuideToShot2();

  } else {
    // Both photos taken — send BOTH to Gemini in one request
    currentShot = 2;
    isAnalysing = true;
    btn.disabled        = true;
    btn.textContent     = "⏳ Analysing both photos...";
    btn.style.opacity   = "0.5";
    btn.style.pointerEvents = "none";
    showBanner("🤖 Gemini is reading all 6 faces at once...");

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 90000);

    try {
      const res = await fetch("/analyze-both", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ image1: photosTaken[0], image2: photosTaken[1] }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if(!data.ok){
        showBanner(`⚠️ ${data.error}`, "error");
        isAnalysing = false;
        btn.disabled = false;
        btn.textContent = "📸 Retake Photo 2";
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.onclick = takePhoto;
        currentShot = 1; // allow retake
        return;
      }

      // Map Gemini response to faceColors
      // photo1: top→U(0), left→L(4), right→F(1)
      // photo2: bottom→D(5), left→R(2), right→B(3)
      const p1map = { top:0, left:4, right:1 };
      const p2map = { bottom:5, left:2, right:3 };

      for(const [key,idx] of Object.entries(p1map)){
        if(data.photo1[key] && data.photo1[key].length===16)
          faceColors[idx] = data.photo1[key].map(c=>c.toLowerCase().trim());
      }
      for(const [key,idx] of Object.entries(p2map)){
        if(data.photo2[key] && data.photo2[key].length===16)
          faceColors[idx] = data.photo2[key].map(c=>c.toLowerCase().trim());
      }

      if(typeof updateThreeCube==="function") updateThreeCube();

      markStep(1,"done"); markStep(2,"active");
      document.getElementById("main-title").textContent = "ALL FACES SCANNED";
      document.getElementById("main-desc").innerHTML    = "Both photos analysed. Review colours if needed, then press Solve.";
      showBanner("✅ All 6 faces read in one shot! Review then hit Solve.");
      btn.style.display = "none";
      document.getElementById("edit-row").style.display  = "flex";
      document.getElementById("solve-row").style.display = "flex";
      if(typeof hideGuideShowCubeState==="function") hideGuideShowCubeState();
      if(document.getElementById("cube-viewer-label"))
        document.getElementById("cube-viewer-label").textContent = "All 6 faces scanned";

    } catch(err){
      clearTimeout(timeoutId);
      showBanner(`⚠️ Error: ${err.message}`, "error");
      isAnalysing = false;
      btn.disabled = false;
      btn.textContent = "📸 Retake Photo 2";
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
      btn.onclick = takePhoto;
      currentShot = 1;
    }
  }
}

function showBanner(msg, type="info"){
  const b = document.getElementById("status-banner");
  if(!b) return;
  b.style.display="block";
  b.style.background = type==="error" ? "rgba(255,77,77,0.08)" : "rgba(200,241,53,0.08)";
  b.style.borderColor= type==="error" ? "rgba(255,77,77,0.2)"  : "rgba(200,241,53,0.2)";
  b.style.color      = type==="error" ? "#ff9090"               : "var(--accent)";
  b.textContent = msg;
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
  btn.textContent="↺ Restart";
  btn.setAttribute("onclick","doRestart()");
  btn.setAttribute("ontouchend","event.preventDefault();doRestart()");
  btn.style.cssText="position:fixed;top:14px;right:16px;z-index:9999;background:#1e1e1e;border:1px solid #3a3a3a;color:#888;border-radius:8px;padding:10px 18px;font-family:inherit;font-size:.85rem;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;";
  document.body.appendChild(btn);
}

function doRestart(){
  currentShot  = 0;
  faceColors   = Array(6).fill(null).map(() => Array(16).fill("white"));
  photosTaken  = [null, null];
  activePaintColor = COLOR_NAMES[0];

  const el = id => document.getElementById(id);

  if(el("shot-num"))       el("shot-num").textContent       = "1";
  if(el("main-title"))     el("main-title").textContent     = "POINT AT A CORNER";
  if(el("main-desc"))      el("main-desc").textContent      = "Hold your cube so you can see 3 faces at once. Take the photo when all 3 faces are clearly visible.";
  if(el("status-banner"))  el("status-banner").style.display= "none";
  if(el("edit-row"))       el("edit-row").style.display     = "none";
  if(el("solve-row"))      el("solve-row").style.display    = "none";
  if(el("solution-area"))  el("solution-area").style.display= "none";
  if(el("moves-wrap"))     el("moves-wrap").innerHTML       = "";
  if(el("move-count"))     el("move-count").textContent     = "";
  if(el("twisty-wrap"))    el("twisty-wrap").style.display  = "block";
  if(el("cube-viewer-label")) el("cube-viewer-label").textContent = "Waiting for scan...";

  const btn = el("capture-btn");
  if(btn){
    btn.style.display = "";
    btn.disabled      = false;
    btn.textContent   = "📸 Take Photo";
    btn.onclick       = takePhoto;
  }

  if(el("photo-slot-0")){ el("photo-slot-0").innerHTML = '<div class="photo-slot-empty">Corner 1<br>not taken</div>'; el("photo-slot-0").classList.remove("done"); }
  if(el("photo-slot-1")){ el("photo-slot-1").innerHTML = '<div class="photo-slot-empty">Corner 2<br>not taken</div>'; el("photo-slot-1").classList.remove("done"); }

  const solveBtn = el("solve-btn");
  if(solveBtn){ solveBtn.innerHTML = "✅ Solve the Cube!"; solveBtn.disabled = false; }

  [0,1,2].forEach(i => markStep(i,""));
  markStep(0,"active");

  if(typeof updateThreeCube === "function") updateThreeCube();
  if(el("guide-anim-wrap"))  el("guide-anim-wrap").style.display  = "block";
  if(el("cube-viewer-wrap")) el("cube-viewer-wrap").style.display = "none";
  if(typeof CORNER_TARGETS !== "undefined" && CORNER_TARGETS[0]){
    if(el("guide-anim-badge"))       el("guide-anim-badge").textContent     = CORNER_TARGETS[0].badge;
    if(el("guide-anim-label"))       el("guide-anim-label").textContent     = CORNER_TARGETS[0].label;
    if(el("guide-anim-instruction")) el("guide-anim-instruction").innerHTML = CORNER_TARGETS[0].instruction;
  }
  if(typeof guidePhase !== "undefined") guidePhase = 0;

  window.scrollTo({top:0, behavior:"smooth"});
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

// guide switching now handled inside takePhoto directly
