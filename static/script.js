let supabase;
const video = document.getElementById('webcam');
const captureBtn = document.getElementById('capture-btn');
const statusText = document.getElementById('status-text');
let faceData = []; 

const FACE_LABELS = ["White (Top)", "Green (Front)", "Red (Right)", "Blue (Back)", "Orange (Left)", "Yellow (Bottom)"];

// 1. Initial Handshake & Auth
async function init() {
    const res = await fetch("/config");
    const config = await res.json();
    
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = createClient(config.url, config.key);

    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('auth-gate').style.display = 'none';
            const appUi = document.getElementById('app-interface');
            appUi.style.display = 'block';
            setTimeout(() => appUi.style.opacity = 1, 50);
            startCamera();
        }
    });
}
init();

window.signIn = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
};

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
}

// 2. Capture Logic
captureBtn.onclick = async () => {
    captureBtn.disabled = true;
    captureBtn.innerText = "🤖 AI ANALYZING...";

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);

    const res = await fetch("/scan-face", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: canvas.toDataURL("image/jpeg") })
    });

    const data = await res.json();
    if (data.success) {
        faceData.push(data.colors);
        if (faceData.length < 6) {
            statusText.innerText = `SCAN FACE ${faceData.length + 1} OF 6`;
            document.getElementById('instruction-text').innerText = `Now hold the ${FACE_LABELS[faceData.length]} face up.`;
            captureBtn.disabled = false;
            captureBtn.innerText = "📸 Capture Next";
        } else {
            statusText.innerText = "SOLVING...";
            console.log("Full Cube Scanned:", faceData);
            // Solver logic goes here
        }
    } else {
        alert("Scan failed. Ensure lighting is good!");
        captureBtn.disabled = false;
        captureBtn.innerText = "📸 Capture Face";
    }
};
