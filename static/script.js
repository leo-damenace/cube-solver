// ═══════════════════════════════════════════════════════
//  CubeSolve — FIXED script.js (AUTH + SOLVER SAFE)
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
let supabase = null;
let currentUser = null;
let photosTaken = [];
let faceColors = {};
let isAnalysing = false;
let activePaint = COLOUR_NAMES[0];

// ── INIT SUPABASE ─────────────────────────────────────────
window.addEventListener("load", () => {
  supabase = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  supabase.auth.getSession().then(({ data }) => {
    if (data.session) showApp(data.session.user);
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session.user);
    else showAuth();
  });
});

// ── AUTH ─────────────────────────────────────────────────
document.getElementById("google-btn").onclick = async () => {
  const btn = document.getElementById("google-btn");
  btn.disabled = true;
  btn.textContent = "Signing in...";

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });

  if (error) {
    alert(error.message);
    btn.disabled = false;
    btn.textContent = "Sign in with Google";
  }
};

async function signOut() {
  await supabase.auth.signOut();
  showAuth();
}

function showAuth() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app").style.display = "none";
}

function showApp(user) {
  currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "block";

  startCamera();
}

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

  const counts = getColourCounts();
  let errorMsg = "";

  for (const colour of COLOUR_NAMES) {
    if (counts[colour] !== 16) {
      errorMsg += `${colour}: ${counts[colour] || 0}/16\n`;
    }
  }

  if (errorMsg) {
    alert(`Fix colours first:\n\n${errorMsg}`);
    return;
  }

  btn.innerHTML = "Solving...";
  btn.disabled  = true;

  let stateStr = "";
  for (const letter of CUBING_ORDER) {
    for (const c of faceColors[letter]) {
      stateStr += (COLOR_TO_FACE[c] || "U");
    }
  }

  try {
    const { experimental4x4x4Solve } = await import("https://cdn.cubing.net/v0/js/cubing/search");
    const solution = await experimental4x4x4Solve(stateStr);

    showSolution(solution.toString());

  } catch (err) {
    alert("Invalid cube — fix colours.");
    btn.innerHTML = "Solve";
    btn.disabled  = false;
  }
}

// ── SHOW SOLUTION ────────────────────────────────────────
function showSolution(algStr) {
  document.getElementById("solution-area").style.display = "block";
  document.getElementById("moves-wrap").textContent = algStr;
}
