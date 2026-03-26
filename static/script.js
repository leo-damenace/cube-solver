let supabase;
const video = document.getElementById('webcam');
const captureBtn = document.getElementById('capture-btn');
let cubeData = [];

// 1. Initialize App & Fetch Config
async function init() {
    const res = await fetch("/config");
    const config = await res.json();
    
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = createClient(config.url, config.key);

    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('auth-gate').style.display = 'none';
            document.getElementById('main-app').style.display = 'block';
            startCamera();
        }
    });
}
init();

// 2. Auth Actions
window.signIn = async () => {
    await supabase.auth.signInWithOAuth({ 
        provider: 'google', 
        options: { redirectTo: window.location.origin } 
    });
};

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
}

// 3. Scan Actions
captureBtn.onclick = async () => {
    captureBtn.disabled = true;
    captureBtn.innerText = "🤖 AI SCANNING...";

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
        cubeData.push(data.colors);
        if (cubeData.length < 6) {
            captureBtn.disabled = false;
            captureBtn.innerText = "Capture Next Face";
            document.getElementById('status').innerText = `Face ${cubeData.length + 1} of 6`;
        } else {
            document.getElementById('status').innerText = "Solving...";
            console.log("Full Cube Data Ready:", cubeData);
        }
    }
};
