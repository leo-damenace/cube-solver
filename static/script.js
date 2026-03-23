// ═══════════════════════════════════════════════════
//  CubeSolve — script.js
//  4 shots → Gemini analyzes all → 3D cube appears → tap to fix → solve
// ═══════════════════════════════════════════════════

const CUBING_ORDER  = ["U","R","F","D","L","B"];
const COLOR_TO_FACE = { white:"U", red:"R", green:"F", yellow:"D", orange:"L", blue:"B" };

const CUBE_COLORS = {
  white:  "#f0f0f0",
  yellow: "#ffd200",
  red:    "#d21919",
  orange: "#ff6400",
  blue:   "#0046c8",
  green:  "#009b2d",
};
const ALL_COLORS  = Object.keys(CUBE_COLORS);
const DEFAULT_HEX = "#2a2a2a";

const SHOTS = [
  { n:1, title:"SHOT 1 OF 4", sub:"Top corner — hold cube so Top, Front & Right are visible.", badge:"SHOT 1 / 4" },
  { n:2, title:"SHOT 2 OF 4", sub:"Flip to opposite corner — Bottom, Back & Left visible.", badge:"SHOT 2 / 4" },
  { n:3, title:"SHOT 3 OF 4", sub:"Rotate cube on its side — all 4 side faces visible in a band.", badge:"SHOT 3 / 4" },
  { n:4, title:"SHOT 4 OF 4", sub:"Rotate 90° — same side band from new angle.", badge:"SHOT 4 / 4" },
];

// ── STATE ─────────────────────────────────────────────────
let currentShot = 0;       // 0-3
let capturedImages = {};   // {"1":b64, "2":b64, ...}
let faceData = {};         // final merged colors from Gemini
let analyzing = false;

// faceHexGrid[fi][r][c] — for 3D renderer
// fi: 0=U 1=F 2=R 3=B 4=L 5=D
const FACE_IDX = {U:0,F:1,R:2,B:3,L:4,D:5};
let faceHexGrid = Array.from({length:6},()=>Array.from({length:4},()=>Array(4).fill(DEFAULT_HEX)));

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
const resetBtn    = document.getElementById("reset-btn");
const solutionArea= document.getElementById("solution-area");
const mainTitle   = document.getElementById("main-title");
const mainDesc    = document.getElementById("main-desc");
const faceNameEl  = document.getElementById("face-name");
const faceNumEl   = document.getElementById("face-num");
const cubeSection = document.getElementById("cube-section");
const cubeCanvas  = document.getElementById("cube-canvas");

// ── GATE ──────────────────────────────────────────────────
async function checkCode() {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  enterBtn.disabled = true;
  enterBtn.innerHTML = '<span class="spinner"></span> Checking...';
  try {
    const res  = await fetch("/verify-code", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({code})
    });
    const data = await res.json();
    if (data.valid) {
      gateEl.style.display = "none";
      appEl.style.display  = "block";
      startCamera();
      startCubeRenderer();
      updateShotUI(0);
    } else {
      gateError.textContent = "Invalid code.";
      codeInput.classList.add("shake");
      codeInput.addEventListener("animationend",()=>codeInput.classList.remove("shake"),{once:true});
      enterBtn.disabled = false; enterBtn.textContent = "Enter";
    }
  } catch {
    gateError.textContent = "Network error.";
    enterBtn.disabled = false; enterBtn.textContent = "Enter";
  }
}
enterBtn.addEventListener("click", checkCode);
codeInput.addEventListener("keydown", e=>{if(e.key==="Enter")checkCode();});
codeInput.addEventListener("input",   ()=>{gateError.textContent="";});

// ── CAMERA ────────────────────────────────────────────────
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video:{facingMode:"environment",width:{ideal:1280},height:{ideal:960}}
    });
    video.srcObject = stream;
    video.addEventListener("loadedmetadata", ()=>{
      overlay.width  = video.videoWidth  || video.clientWidth;
      overlay.height = video.videoHeight || video.clientHeight;
      drawOverlay();
    });
  } catch { alert("Camera access denied. Please allow camera and reload."); }
}

// ── OVERLAY — corner brackets only, no dimming ────────────
function drawOverlay() {
  const w=overlay.width, h=overlay.height;
  ctx.clearRect(0,0,w,h);

  const size=Math.min(w,h)*0.88, sx=(w-size)/2, sy=(h-size)/2;
  const bL=size*0.07;

  ctx.strokeStyle="#c8f135"; ctx.lineWidth=3; ctx.lineCap="round";
  [[sx,sy,1,1],[sx+size,sy,-1,1],[sx,sy+size,1,-1],[sx+size,sy+size,-1,-1]].forEach(([x,y,dx,dy])=>{
    ctx.beginPath(); ctx.moveTo(x+dx*bL,y); ctx.lineTo(x,y); ctx.lineTo(x,y+dy*bL); ctx.stroke();
  });

  ctx.beginPath(); ctx.arc(w/2,h/2,4,0,Math.PI*2); ctx.fillStyle="#c8f135"; ctx.fill();

  requestAnimationFrame(drawOverlay);
}

// ── SHOT GUIDE DIAGRAM ────────────────────────────────────
const GUIDE_CONFIGS = [
  {
    faces:  ["U","F","R"],
    // camera vertex = top-front-right corner (x=+half, y=+half, z=+half)
    vertex: { x:2, y:2, z:2 },
    isBand: false,
    text:   "Point the <strong>top-front-right corner</strong> at the camera — you should see 3 faces at once.",
  },
  {
    faces:  ["D","B","L"],
    // camera vertex = bottom-back-left corner
    vertex: { x:-2, y:-2, z:-2 },
    isBand: false,
    text:   "Flip to the <strong>opposite corner</strong> — bottom, back and left faces visible.",
  },
  {
    faces:  ["F","R","B","L"],
    // band shot — red line along the front vertical edge (x=+half, z=+half, y varies)
    isBand: true,
    bandEdge: [ {x:2,y:2,z:2}, {x:2,y:-2,z:2} ],
    text:   "Tilt on its side — <strong>all 4 side faces</strong> visible going around.",
  },
  {
    faces:  ["F","R","B","L"],
    // rotated 90° — red line along right vertical edge
    isBand: true,
    bandEdge: [ {x:2,y:2,z:-2}, {x:2,y:-2,z:-2} ],
    text:   "Rotate 90° — <strong>same 4 sides</strong> from new angle.",
  },
];

function drawGuide(shotIdx) {
  const canvas = document.getElementById("guide-canvas");
  const textEl = document.getElementById("guide-text");
  if (!canvas || !textEl) return;

  const cfg = GUIDE_CONFIGS[shotIdx];
  textEl.innerHTML = cfg.text;

  const rc = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  rc.clearRect(0, 0, W, H);

  const N    = 4;
  const cell = 10;
  const cx   = W / 2, cy = H * 0.52;
  const tilt = 0.52;
  const yRot = cfg.isBand ? 0.4 : 0.6;

  function project(x, y, z) {
    const x1 =  x*Math.cos(yRot) + z*Math.sin(yRot);
    const z1 = -x*Math.sin(yRot) + z*Math.cos(yRot);
    const y2 =  y*Math.cos(tilt) - z1*Math.sin(tilt);
    return { sx: cx + x1*cell, sy: cy - y2*cell };
  }

  function faceVisible(nx, ny, nz) {
    const nx1 =  nx*Math.cos(yRot)+nz*Math.sin(yRot), nz1 = -nx*Math.sin(yRot)+nz*Math.cos(yRot);
    const ny2 =  ny*Math.cos(tilt)-nz1*Math.sin(tilt), nz2 =  ny*Math.sin(tilt)+nz1*Math.cos(tilt);
    return -nz2 > 0.04;
  }

  function faceDepth(nx, ny, nz) {
    const nx1 =  nx*Math.cos(yRot)+nz*Math.sin(yRot), nz1 = -nx*Math.sin(yRot)+nz*Math.cos(yRot);
    return ny*Math.sin(tilt)+nz1*Math.cos(tilt);
  }

  const half = N / 2;
  const faceDefs = [
    {key:"U", nx:0,  ny:1,  nz:0,  corners:()=>[ project(-half,+half,-half),project(+half,+half,-half),project(+half,+half,+half),project(-half,+half,+half) ]},
    {key:"F", nx:0,  ny:0,  nz:1,  corners:()=>[ project(-half,+half,+half),project(+half,+half,+half),project(+half,-half,+half),project(-half,-half,+half) ]},
    {key:"R", nx:1,  ny:0,  nz:0,  corners:()=>[ project(+half,+half,-half),project(+half,+half,+half),project(+half,-half,+half),project(+half,-half,-half) ]},
    {key:"B", nx:0,  ny:0,  nz:-1, corners:()=>[ project(+half,+half,-half),project(-half,+half,-half),project(-half,-half,-half),project(+half,-half,-half) ]},
    {key:"L", nx:-1, ny:0,  nz:0,  corners:()=>[ project(-half,+half,+half),project(-half,+half,-half),project(-half,-half,-half),project(-half,-half,+half) ]},
    {key:"D", nx:0,  ny:-1, nz:0,  corners:()=>[ project(-half,-half,+half),project(+half,-half,+half),project(+half,-half,-half),project(-half,-half,-half) ]},
  ];

  // Sort by depth for painter's algorithm
  const visible = faceDefs
    .filter(fd => faceVisible(fd.nx, fd.ny, fd.nz))
    .sort((a,b) => faceDepth(a.nx,a.ny,a.nz) - faceDepth(b.nx,b.ny,b.nz));

  // Draw faces
  for (const fd of visible) {
    const hi = cfg.faces.includes(fd.key);
    const pts = fd.corners();
    rc.beginPath();
    rc.moveTo(pts[0].sx, pts[0].sy);
    pts.slice(1).forEach(p => rc.lineTo(p.sx, p.sy));
    rc.closePath();
    rc.fillStyle   = hi ? "rgba(200,241,53,0.22)" : "rgba(20,20,20,0.95)";
    rc.fill();
    rc.strokeStyle = hi ? "#c8f135" : "#2a2a2a";
    rc.lineWidth   = hi ? 1.5 : 0.8;
    rc.stroke();
  }

  // Draw 4x4 grid lines on highlighted faces only
  for (const fd of visible) {
    if (!cfg.faces.includes(fd.key)) continue;
    // Draw inner grid lines (thin, same accent color)
    rc.strokeStyle = "rgba(200,241,53,0.35)";
    rc.lineWidth   = 0.6;
    for (let i = 1; i < N; i++) {
      const t = i / N;
      // Interpolate across the face
      const pts = fd.corners();
      // Top edge point and bottom edge point at fraction t
      const top1 = { sx: pts[0].sx+(pts[1].sx-pts[0].sx)*t, sy: pts[0].sy+(pts[1].sy-pts[0].sy)*t };
      const bot1 = { sx: pts[3].sx+(pts[2].sx-pts[3].sx)*t, sy: pts[3].sy+(pts[2].sy-pts[3].sy)*t };
      const lft1 = { sx: pts[0].sx+(pts[3].sx-pts[0].sx)*t, sy: pts[0].sy+(pts[3].sy-pts[0].sy)*t };
      const rgt1 = { sx: pts[1].sx+(pts[2].sx-pts[1].sx)*t, sy: pts[1].sy+(pts[2].sy-pts[1].sy)*t };
      rc.beginPath(); rc.moveTo(top1.sx,top1.sy); rc.lineTo(bot1.sx,bot1.sy); rc.stroke();
      rc.beginPath(); rc.moveTo(lft1.sx,lft1.sy); rc.lineTo(rgt1.sx,rgt1.sy); rc.stroke();
    }
  }

  if (!cfg.isBand) {
    // Corner shots: red dot at the camera vertex
    const vp = project(cfg.vertex.x, cfg.vertex.y, cfg.vertex.z);
    // Outer glow
    rc.beginPath(); rc.arc(vp.sx, vp.sy, 7, 0, Math.PI*2);
    rc.fillStyle = "rgba(255,60,60,0.25)"; rc.fill();
    // Dot
    rc.beginPath(); rc.arc(vp.sx, vp.sy, 4, 0, Math.PI*2);
    rc.fillStyle = "#ff3c3c"; rc.fill();
    rc.strokeStyle = "#fff"; rc.lineWidth = 1; rc.stroke();

    // Draw edges from vertex — show the 3 edges meeting at this corner
    const neighbours = [
      { x:-cfg.vertex.x, y:cfg.vertex.y,  z:cfg.vertex.z  },
      { x:cfg.vertex.x,  y:-cfg.vertex.y, z:cfg.vertex.z  },
      { x:cfg.vertex.x,  y:cfg.vertex.y,  z:-cfg.vertex.z },
    ];
    rc.strokeStyle = "#ff3c3c"; rc.lineWidth = 1.8; rc.lineCap = "round";
    for (const nb of neighbours) {
      const np = project(nb.x, nb.y, nb.z);
      rc.beginPath(); rc.moveTo(vp.sx, vp.sy); rc.lineTo(np.sx, np.sy); rc.stroke();
    }
  } else {
    // Band shots: red line along the highlighted vertical edge
    const [a, b] = cfg.bandEdge.map(v => project(v.x, v.y, v.z));
    rc.strokeStyle = "#ff3c3c"; rc.lineWidth = 2.5; rc.lineCap = "round";
    rc.beginPath(); rc.moveTo(a.sx, a.sy); rc.lineTo(b.sx, b.sy); rc.stroke();
    // Dots at each end
    [a, b].forEach(p => {
      rc.beginPath(); rc.arc(p.sx, p.sy, 3, 0, Math.PI*2);
      rc.fillStyle = "#ff3c3c"; rc.fill();
    });
  }
}

// ── PHOTO STRIP ───────────────────────────────────────────
function addPhotoThumb(shotNum, dataURL) {
  const strip = document.getElementById("photo-strip");
  const thumbs = document.getElementById("photo-thumbs");
  if (!strip || !thumbs) return;

  strip.style.display = "block";

  // Remove existing thumb for this shot if retrying
  const existing = document.getElementById(`thumb-${shotNum}`);
  if (existing) existing.remove();

  const wrap = document.createElement("div");
  wrap.id = `thumb-${shotNum}`;
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;";

  const img = document.createElement("img");
  img.src = dataURL;
  img.style.cssText = "width:72px;height:72px;object-fit:cover;border-radius:8px;border:2px solid var(--accent);";

  const lbl = document.createElement("div");
  lbl.style.cssText = "font-size:0.6rem;color:var(--muted);letter-spacing:1px;text-transform:uppercase;font-family:'DM Mono',monospace;";
  lbl.textContent = `Shot ${shotNum}`;

  wrap.appendChild(img);
  wrap.appendChild(lbl);
  thumbs.appendChild(wrap);
}

// ── SHOT UI ───────────────────────────────────────────────
function updateShotUI(idx) {
  const s = SHOTS[idx];
  mainTitle.textContent  = s.title;
  mainDesc.textContent   = s.sub;
  faceNameEl.textContent = s.badge;
  faceNumEl.textContent  = idx;
  captureBtn.textContent = `📸  Take Shot ${idx+1}`;
  captureBtn.disabled    = false;

  const badge = document.getElementById("shot-badge");
  if (badge) badge.textContent = `${idx+1} / 4`;

  drawGuide(idx);

  document.querySelectorAll(".face-step").forEach((el,i)=>{
    el.classList.remove("active","done");
    if (i < idx)  el.classList.add("done");
    if (i === idx) el.classList.add("active");
  });
}

// ── CAPTURE ───────────────────────────────────────────────
captureBtn.addEventListener("click", async ()=>{
  if (analyzing) return;

  // Snapshot + crop to square zone
  const snap=document.createElement("canvas");
  snap.width=video.videoWidth||640; snap.height=video.videoHeight||480;
  snap.getContext("2d").drawImage(video,0,0);
  const sw=snap.width,sh=snap.height;
  const size=Math.min(sw,sh)*0.78, sx=(sw-size)/2, sy=(sh-size)/2;
  const crop=document.createElement("canvas");
  crop.width=crop.height=640;
  crop.getContext("2d").drawImage(snap,sx,sy,size,size,0,0,640,640);
  const snapDataURL = crop.toDataURL("image/jpeg", 0.7);
  const b64 = snapDataURL.split(",")[1];

  capturedImages[String(currentShot+1)] = b64;

  // Show thumbnail immediately
  addPhotoThumb(currentShot+1, snapDataURL);

  // Mark step done
  const steps=document.querySelectorAll(".face-step");
  if(steps[currentShot]){steps[currentShot].classList.remove("active");steps[currentShot].classList.add("done");}

  currentShot++;
  faceNumEl.textContent = currentShot;

  if (currentShot < 4) {
    // More shots to take
    updateShotUI(currentShot);
  } else {
    // All 4 shots taken — send to Gemini
    captureBtn.disabled  = true;
    captureBtn.innerHTML = '<span class="spinner"></span> Analyzing all shots...';
    mainTitle.textContent = "ANALYZING...";
    mainDesc.textContent  = "Gemini is reading all 6 faces. This takes ~15 seconds.";
    analyzing = true;

    try {
      const res  = await fetch("/analyze-all", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({images: capturedImages})
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      faceData = data.faces;

      // Update 3D cube with all colors at once
      for (const [fk, colors] of Object.entries(faceData)) {
        const fi = FACE_IDX[fk];
        for (let r=0;r<4;r++) for (let c=0;c<4;c++)
          faceHexGrid[fi][r][c] = CUBE_COLORS[colors[r*4+c]] || DEFAULT_HEX;
      }

      // Show cube section
      cubeSection.style.display = "block";
      mainTitle.textContent = "CHECK YOUR CUBE";
      mainDesc.textContent  = "Tap any sticker on the 3D cube to correct a wrong colour, then press Solve.";
      solveRow.style.display = "flex";
      resetBtn.style.display = "block";
      captureBtn.style.display = "none";

    } catch(err) {
      showError("Analysis failed: " + err.message);
      captureBtn.disabled  = false;
      captureBtn.innerHTML = "🔄 Retry Analysis";
      mainTitle.textContent = "SHOT 4 OF 4";
      currentShot = 3;
      analyzing = false;
      updateShotUI(3);
    }
    analyzing = false;
  }
});

// ══════════════════════════════════════════════════════════
//  INTERACTIVE 3D CUBE — tap stickers to fix colors
// ══════════════════════════════════════════════════════════
let cubeAngle   = 0.5;
let cubeAutoSpin = true;
let lastHit     = null;  // {fi, r, c} of last tapped sticker

// All projected quads from last render — for hit testing
let lastQuads = [];

function startCubeRenderer() {
  const rc = cubeCanvas.getContext("2d");
  (function loop() {
    if (cubeAutoSpin) cubeAngle += 0.007;
    drawCube(rc, cubeCanvas.width, cubeCanvas.height, cubeAngle);
    requestAnimationFrame(loop);
  })();

  // Tap/click on cube canvas
  cubeCanvas.addEventListener("pointerdown", onCubeTap);
}

function drawCube(rc, W, H, angle) {
  rc.clearRect(0,0,W,H);
  const N=4, scale=Math.min(W,H)*0.17, cx=W*0.5, cy=H*0.50, tiltX=0.50, half=N/2, INSET=0.07;

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

  const faceDefs=[
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
      const depth=pts.reduce((s,p)=>s+p.depth,0)/4;
      const hex=faceHexGrid[fd.fi][r][c];
      const isHit = lastHit && lastHit.fi===fd.fi && lastHit.r===r && lastHit.c===c;
      allQuads.push({pts,depth,hex,fi:fd.fi,r,c,isHit});
    }
  }
  allQuads.sort((a,b)=>a.depth-b.depth);
  lastQuads = allQuads;

  for (const {pts,hex,isHit} of allQuads) {
    const [p0,p1,p2,p3]=pts;
    // Black body
    rc.beginPath(); rc.moveTo(p0.sx,p0.sy); rc.lineTo(p1.sx,p1.sy); rc.lineTo(p2.sx,p2.sy); rc.lineTo(p3.sx,p3.sy); rc.closePath();
    rc.fillStyle="#0d0d0d"; rc.fill();
    // Inset sticker
    const mcx=(p0.sx+p1.sx+p2.sx+p3.sx)/4, mcy=(p0.sy+p1.sy+p2.sy+p3.sy)/4;
    function lerp(a,b,t){return{sx:a.sx+(b.sx-a.sx)*t,sy:a.sy+(b.sy-a.sy)*t};}
    const C={sx:mcx,sy:mcy};
    const i0=lerp(p0,C,INSET),i1=lerp(p1,C,INSET),i2=lerp(p2,C,INSET),i3=lerp(p3,C,INSET);
    rc.beginPath(); rc.moveTo(i0.sx,i0.sy); rc.lineTo(i1.sx,i1.sy); rc.lineTo(i2.sx,i2.sy); rc.lineTo(i3.sx,i3.sy); rc.closePath();
    rc.fillStyle = hex; rc.fill();
    // Highlight selected
    if (isHit) {
      rc.strokeStyle="#fff"; rc.lineWidth=2; rc.stroke();
    } else if (hex!==DEFAULT_HEX) {
      rc.strokeStyle="rgba(255,255,255,0.12)"; rc.lineWidth=0.5; rc.stroke();
    }
  }
}

// Hit test — point in polygon
function pointInQuad(px,py,pts) {
  const [p0,p1,p2,p3]=pts;
  const poly=[{x:p0.sx,y:p0.sy},{x:p1.sx,y:p1.sy},{x:p2.sx,y:p2.sy},{x:p3.sx,y:p3.sy}];
  let inside=false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y;
    if (((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}

function onCubeTap(e) {
  if (cubeSection.style.display==="none") return;
  const rect=cubeCanvas.getBoundingClientRect();
  const scaleX=cubeCanvas.width/rect.width, scaleY=cubeCanvas.height/rect.height;
  const px=(e.clientX-rect.left)*scaleX, py=(e.clientY-rect.top)*scaleY;

  // Find topmost (last rendered = nearest) quad that contains tap
  let hit=null;
  for (let i=lastQuads.length-1;i>=0;i--) {
    if (pointInQuad(px,py,lastQuads[i].pts)) { hit=lastQuads[i]; break; }
  }
  if (!hit) { closeColorPicker(); return; }

  // Pause spin while editing
  cubeAutoSpin = false;
  lastHit = {fi:hit.fi, r:hit.r, c:hit.c};
  openColorPicker(hit, e.clientX, e.clientY);
}

// ── COLOR PICKER ──────────────────────────────────────────
let activePopover=null, pickerOpenTime=0;

function openColorPicker(hit, clientX, clientY) {
  closeColorPicker();
  pickerOpenTime=Date.now();

  const faceKey = Object.keys(FACE_IDX).find(k=>FACE_IDX[k]===hit.fi);
  const idx     = hit.r*4+hit.c;

  const pop=document.createElement("div");
  pop.className="color-popover";

  // Label
  const lbl=document.createElement("div");
  lbl.style.cssText="font-size:0.65rem;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;width:100%;";
  lbl.textContent=`Face ${faceKey} · sticker ${idx+1}`;
  pop.appendChild(lbl);

  // Swatches row
  const row=document.createElement("div");
  row.style.cssText="display:flex;gap:6px;";
  ALL_COLORS.forEach(colorName=>{
    const sw=document.createElement("div");
    sw.className="color-swatch";
    sw.style.background=CUBE_COLORS[colorName];
    sw.title=colorName;
    const currentHex=faceHexGrid[hit.fi][hit.r][hit.c];
    if (CUBE_COLORS[colorName]===currentHex) sw.classList.add("selected");
    sw.addEventListener("pointerdown",ev=>{
      ev.stopPropagation(); ev.preventDefault();
      faceHexGrid[hit.fi][hit.r][hit.c]=CUBE_COLORS[colorName];
      // Update faceData too
      if (!faceData[faceKey]) faceData[faceKey]=Array(16).fill("white");
      faceData[faceKey][idx]=colorName;
      lastHit=null;
      cubeAutoSpin=true;
      closeColorPicker();
    });
    row.appendChild(sw);
  });
  pop.appendChild(row);

  // Position near tap
  const popW=ALL_COLORS.length*38+20;
  let left=clientX+window.scrollX-popW/2;
  let top =clientY+window.scrollY+20;
  if (left+popW>window.innerWidth-8) left=window.innerWidth-popW-8;
  if (left<8) left=8;
  pop.style.cssText+=`position:absolute;top:${top}px;left:${left}px;`;
  document.body.appendChild(pop);
  activePopover=pop;
}

function closeColorPicker() {
  if (activePopover){activePopover.remove();activePopover=null;}
  lastHit=null; cubeAutoSpin=true;
}

document.addEventListener("pointerdown",e=>{
  if (!activePopover) return;
  if (Date.now()-pickerOpenTime<200) return;
  if (!activePopover.contains(e.target)&&e.target!==cubeCanvas) closeColorPicker();
});

// ── ERROR ─────────────────────────────────────────────────
function showError(msg) {
  let box=document.getElementById("err-box");
  if (!box){box=document.createElement("div");box.id="err-box";box.className="error-box";document.getElementById("faces-section").before(box);}
  box.innerHTML=`<strong>Error:</strong> ${msg}`;
  box.style.display="block";
  setTimeout(()=>{if(box)box.style.display="none";},8000);
}

// ── SOLVE ─────────────────────────────────────────────────
solveBtn.addEventListener("click", async ()=>{
  solveBtn.innerHTML='<span class="spinner"></span> Solving...';
  solveBtn.disabled=true;
  let stateStr="";
  for (const letter of CUBING_ORDER) {
    const colors=faceData[letter];
    if (!colors){showError(`Face ${letter} missing.`);solveBtn.innerHTML="✅ Solve";solveBtn.disabled=false;return;}
    for (const c of colors) stateStr+=COLOR_TO_FACE[c]||"U";
  }
  try {
    const {experimental4x4x4Solve}=await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution=await experimental4x4x4Solve(stateStr);
    showSolution(solution.toString());
  } catch(err) {
    solutionArea.style.display="block";
    document.getElementById("moves-wrap").innerHTML=`<div class="error-box"><strong>Could not solve.</strong><br>Check colours on the cube and try again.</div>`;
    document.getElementById("twisty-wrap").style.display="none";
    document.getElementById("move-count").textContent="";
    solveBtn.innerHTML="✅ Solve the Cube!"; solveBtn.disabled=false;
  }
});

function showSolution(alg) {
  const moves=alg.trim().split(/\s+/).filter(Boolean);
  document.getElementById("move-count").textContent=`${moves.length} moves`;
  const wrap=document.getElementById("moves-wrap"); wrap.innerHTML="";
  moves.forEach(m=>{const c=document.createElement("span");c.className="move-chip";c.textContent=m;wrap.appendChild(c);});
  document.getElementById("twisty").setAttribute("alg",alg);
  document.getElementById("twisty-wrap").style.display="block";
  solutionArea.style.display="block";
  solutionArea.scrollIntoView({behavior:"smooth"});
}

// ── RESET ─────────────────────────────────────────────────
resetBtn.addEventListener("click",()=>{
  currentShot=0; capturedImages={}; faceData={}; analyzing=false; lastHit=null; cubeAutoSpin=true;
  faceHexGrid=Array.from({length:6},()=>Array.from({length:4},()=>Array(4).fill(DEFAULT_HEX)));
  document.querySelectorAll(".face-step").forEach((s,i)=>{s.classList.remove("active","done");if(i===0)s.classList.add("active");});
  mainTitle.textContent="SHOT 1 OF 4"; mainDesc.textContent=SHOTS[0].sub;
  faceNameEl.textContent=SHOTS[0].badge; faceNumEl.textContent="0";
  captureBtn.style.display=""; captureBtn.disabled=false; captureBtn.textContent="📸  Take Shot 1";
  solveRow.style.display="none"; solutionArea.style.display="none"; resetBtn.style.display="none";
  cubeSection.style.display="none";
  solveBtn.innerHTML="✅ Solve the Cube!"; solveBtn.disabled=false;
  document.getElementById("twisty-wrap").style.display="block";
  document.getElementById("move-count").textContent="";
  const eb=document.getElementById("err-box"); if(eb)eb.style.display="none";
  const strip=document.getElementById("photo-strip"), thumbs=document.getElementById("photo-thumbs");
  if(strip)strip.style.display="none"; if(thumbs)thumbs.innerHTML="";
  closeColorPicker();
});
