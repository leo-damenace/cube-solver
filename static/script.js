// ═══════════════════════════════════════════════════════
//  CubeSolve — UPDATED script.js (STABLE SOLVER VERSION)
// ═══════════════════════════════════════════════════════

// ── COLOURS ──────────────────────────────────────────────
const COLOURS = {
  white:  { hex: "#f0f0f0", label: "White"  },
  yellow: { hex: "#ffd200", label: "Yellow" },
  red:    { hex: "#c41e1e", label: "Red"    },
  orange: { hex: "#ff6400", label: "Orange" },
  blue:   { hex: "#0046c8", label: "Blue"   },
  green:  { hex: "#009b2d", label: "Green"  },
};
const COLOUR_NAMES = ["white","yellow","red","orange","blue","green"];

const COLOR_TO_FACE = { white:"U", yellow:"D", green:"F", blue:"B", orange:"L", red:"R" };
const CUBING_ORDER  = ["U","R","F","D","L","B"];

// ── STATE ────────────────────────────────────────────────
let photosTaken   = [];
let faceColors    = {};
let isAnalysing   = false;
let activePaint   = COLOUR_NAMES[0];

// ── CAMERA ───────────────────────────────────────────────
async function startCamera() {
  const video = document.getElementById("camera");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });
  video.srcObject = stream;
  video.play();
}

// ── TAKE PHOTO ───────────────────────────────────────────
function takePhoto() {
  if (isAnalysing) return;

  const video = document.getElementById("camera");
  const snap  = document.createElement("canvas");

  snap.width  = video.videoWidth;
  snap.height = video.videoHeight;
  snap.getContext("2d").drawImage(video, 0, 0);

  const b64 = snap.toDataURL("image/jpeg", 0.8).split(",")[1];
  photosTaken.push(b64);

  if (photosTaken.length === 4) {
    analysePhotos();
  }
}

// ── ANALYSE ──────────────────────────────────────────────
async function analysePhotos() {
  isAnalysing = true;

  const res = await fetch("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ images: photosTaken })
  });

  const data = await res.json();

  if (!data.ok) {
    alert(data.error);
    return;
  }

  faceColors = data.faces;

  document.getElementById("action-row").style.display = "flex";
}

// ── COUNT COLOURS ────────────────────────────────────────
function getColourCounts() {
  const counts = {};
  for (const face of Object.values(faceColors)) {
    for (const c of face) {
      counts[c] = (counts[c] || 0) + 1;
    }
  }
  return counts;
}

// ── SOLVE (FIXED) ────────────────────────────────────────
async function solveCube() {
  const btn = document.getElementById("solve-btn");

  // ✅ VALIDATE COUNTS FIRST
  const counts = getColourCounts();

  let errorMsg = "";
  for (const colour of COLOUR_NAMES) {
    if (counts[colour] !== 16) {
      errorMsg += `${colour}: ${counts[colour] || 0}/16\n`;
    }
  }

  if (errorMsg) {
    alert(
`Invalid cube colours:

${errorMsg}

Each colour must appear exactly 16 times.

Fix colours before solving.`
    );
    return;
  }

  btn.innerHTML = "Solving...";
  btn.disabled  = true;

  // Build state string
  let stateStr = "";
  for (const letter of CUBING_ORDER) {
    const face = faceColors[letter];
    for (const c of face) {
      stateStr += (COLOR_TO_FACE[c] || "U");
    }
  }

  try {
    const { experimental4x4x4Solve } = await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution = await experimental4x4x4Solve(stateStr);

    showSolution(solution.toString());

  } catch (err) {
    console.error(err);

    document.getElementById("solution-area").style.display = "block";
    document.getElementById("moves-wrap").innerHTML = `
      <div style="color:red;">
        <strong>Invalid cube state.</strong><br><br>
        This cube configuration is impossible.<br><br>
        👉 Fix colours in the editor and try again.
      </div>
    `;

    btn.innerHTML = "Solve";
    btn.disabled  = false;
  }
}

// ── SHOW SOLUTION ────────────────────────────────────────
function showSolution(algStr) {
  const moves = algStr.split(" ");

  const wrap = document.getElementById("moves-wrap");
  wrap.innerHTML = "";

  moves.forEach(m => {
    const span = document.createElement("span");
    span.textContent = m + " ";
    wrap.appendChild(span);
  });

  document.getElementById("solution-area").style.display = "block";
}

// ── EDITOR (UNCHANGED BASIC) ─────────────────────────────
function openEditor() {
  const container = document.getElementById("editor-faces");
  container.innerHTML = "";

  for (const face of ["U","D","F","B","L","R"]) {
    const grid = document.createElement("div");

    (faceColors[face] || []).forEach((c, i) => {
      const cell = document.createElement("div");
      cell.style.background = COLOURS[c]?.hex || "#333";

      cell.onclick = () => {
        faceColors[face][i] = activePaint;
        cell.style.background = COLOURS[activePaint].hex;
      };

      grid.appendChild(cell);
    });

    container.appendChild(grid);
  }

  document.getElementById("editor-modal").style.display = "block";
}

// ── INIT ─────────────────────────────────────────────────
window.onload = () => {
  startCamera();
};
