// ── STATE ─────────────────────────────────────────────────
let supabaseClient = null;
let currentUser    = null;
let photosTaken    = [];
let isAnalysing    = false;

// ── INIT SUPABASE ─────────────────────────────────────────
window.addEventListener("load", () => {
  supabaseClient = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  supabaseClient.auth.getSession().then(({ data }) => {
    if (data.session) showApp(data.session.user);
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session.user);
    else showAuth();
  });
});

// ── GOOGLE SIGN IN ────────────────────────────────────────
document.getElementById("google-btn").onclick = async () => {
  const btn = document.getElementById("google-btn");
  btn.disabled = true;
  btn.textContent = "Signing in...";
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
  if (error) {
    document.getElementById("auth-error").textContent = error.message;
    btn.disabled = false;
    btn.textContent = "Sign in with Google";
  }
};

// ── SIGN OUT ──────────────────────────────────────────────
async function signOut() {
  await supabaseClient.auth.signOut();
  showAuth();
  doRestart();
}

// ── SHOW AUTH / APP ───────────────────────────────────────
function showAuth() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app").style.display = "none";
  currentUser = null;
}

function showApp(user) {
  currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "block";

  const name   = user.user_metadata?.full_name || user.email || "User";
  const avatar = user.user_metadata?.avatar_url;
  document.getElementById("user-name").textContent = name;
  const avatarEl = document.getElementById("user-avatar");
  if (avatar) {
    avatarEl.innerHTML = `<img src="${avatar}" alt="${name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  startCamera();
}

// ── CAMERA ────────────────────────────────────────────────
async function startCamera() {
  const video = document.getElementById("camera");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    video.play();
  } catch (err) {
    showBanner("Camera error: " + err.message, "error");
  }
}

// ── TAKE PHOTO ────────────────────────────────────────────
function takePhoto() {
  if (isAnalysing) return;
  const video = document.getElementById("camera");
  const count = photosTaken.length;
  if (count >= 4) return;

  const snap  = document.createElement("canvas");
  const maxW  = 800;
  const scale = Math.min(1, maxW / (video.videoWidth || 1280));
  snap.width  = Math.floor((video.videoWidth  || 1280) * scale);
  snap.height = Math.floor((video.videoHeight || 720)  * scale);
  snap.getContext("2d").drawImage(video, 0, 0, snap.width, snap.height);
  const b64 = snap.toDataURL("image/jpeg", 0.82).split(",")[1];

  photosTaken.push(b64);

  const slot = document.getElementById(`slot-${count}`);
  slot.innerHTML = `<img src="data:image/jpeg;base64,${b64}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/><div class="photo-slot-label">Photo ${count+1}</div>`;
  slot.classList.add("taken");

  markStep(count, "done");

  if (photosTaken.length < 4) {
    markStep(photosTaken.length, "active");
    document.getElementById("shot-num").textContent   = photosTaken.length + 1;
    document.getElementById("main-title").textContent = `TAKE PHOTO ${photosTaken.length + 1}`;
    const descs = [
      "Rotate the cube and show the back faces.",
      "Tilt to show the top face clearly.",
      "Flip to show the bottom face."
    ];
    document.getElementById("main-desc").textContent = descs[photosTaken.length - 1] || "";
    showBanner(`✅ Photo ${count+1} saved! ${4 - photosTaken.length} more to go.`);
  } else {
    document.getElementById("capture-btn").style.display = "none";
    document.getElementById("main-title").textContent    = "ANALYSING...";
    document.getElementById("main-desc").textContent     = "Sending photos to Gemini...";
    analysePhotos();
  }
}

// ── SEND TO GEMINI ────────────────────────────────────────
async function analysePhotos() {
  isAnalysing = true;
  showBanner("🤖 Sending photos to Gemini...");

  try {
    const res  = await fetch("/analyze", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ images: photosTaken })
    });
    const data = await res.json();

    document.getElementById("main-title").textContent = "GEMINI RESPONSE";
    document.getElementById("main-desc").textContent  = "";

    if (!data.ok) {
      showBanner("⚠️ " + data.error, "error");
    } else {
      showBanner("✅ Gemini responded!");
      showRawOutput(data.raw);
    }
  } catch (err) {
    showBanner("⚠️ " + err.message, "error");
  }

  isAnalysing = false;
  document.getElementById("restart-btn").style.display = "block";
}

// ── SHOW RAW OUTPUT ───────────────────────────────────────
function showRawOutput(raw) {
  const area = document.getElementById("output-area");
  area.style.display = "block";
  document.getElementById("raw-text").value = raw;
  area.scrollIntoView({ behavior: "smooth" });
}

// ── RESTART ───────────────────────────────────────────────
function doRestart() {
  photosTaken = [];
  isAnalysing = false;

  for (let i = 0; i < 4; i++) {
    const slot = document.getElementById(`slot-${i}`);
    slot.innerHTML = `<div class="photo-slot-empty">Photo ${i+1}<br>not taken</div>`;
    slot.classList.remove("taken");
    markStep(i, i === 0 ? "active" : "");
  }

  document.getElementById("shot-num").textContent      = "1";
  document.getElementById("main-title").textContent    = "TAKE PHOTO 1";
  document.getElementById("main-desc").textContent     = "Point your camera at the front of the cube. Make sure at least 3 faces are visible.";
  document.getElementById("capture-btn").style.display = "block";
  document.getElementById("restart-btn").style.display = "none";
  document.getElementById("output-area").style.display = "none";
  document.getElementById("raw-text").value            = "";
  document.getElementById("status-banner").style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── HELPERS ───────────────────────────────────────────────
function markStep(index, state) {
  const el = document.getElementById(`step-${index}`);
  if (!el) return;
  el.classList.remove("active", "done");
  if (state) el.classList.add(state);
}

function showBanner(msg, type = "info") {
  const b = document.getElementById("status-banner");
  if (!b) return;
  b.style.display     = "block";
  b.style.background  = type === "error" ? "rgba(255,77,77,0.08)"  : "rgba(200,241,53,0.07)";
  b.style.borderColor = type === "error" ? "rgba(255,77,77,0.2)"   : "rgba(200,241,53,0.2)";
  b.style.color       = type === "error" ? "#ff9090"                : "var(--accent)";
  b.textContent       = msg;
}
