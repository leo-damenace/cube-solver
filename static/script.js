// Initialize Supabase (Replace with your actual keys)
const supabase = supabase.createClient('YOUR_SUPABASE_URL', 'YOUR_SUPABASE_ANON_KEY');

// ── AUTH LOGIC ──────────────────────────────────────────
async function signInWithGoogle() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
}

// Check if user is logged in on page load
supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
  }
});

// ── MODIFIED CAPTURE LOGIC ──────────────────────────────
async function captureAndScan() {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const base64Image = canvas.toDataURL("image/jpeg");

  captureBtn.textContent = "🤖 AI Thinking...";
  captureBtn.disabled = true;

  try {
    const response = await fetch("/scan-face", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64Image })
    });
    
    const data = await response.json();
    if (data.success) {
      // Map Gemini colors to your internal face mapping
      const stickers = data.colors.map(color => COLOR_TO_FACE[color.toLowerCase()]);
      faceColors.push(stickers);
      processNextFace(); // Continue your existing flow
    }
  } catch (err) {
    alert("Scan failed: " + err.message);
  } finally {
    captureBtn.textContent = "📸 Capture Face";
    captureBtn.disabled = false;
  }
}

// Attach the new function to your existing capture button
captureBtn.addEventListener("click", captureAndScan);
