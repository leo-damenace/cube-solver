const SB_URL = "YOUR_SUPABASE_URL";
const SB_KEY = "YOUR_SUPABASE_ANON_KEY";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let cubeFaces = [];
const FACE_NAMES = ["White (Top)", "Yellow (Bottom)", "Red (Front)", "Orange (Back)", "Green (Left)", "Blue (Right)"];

window.signIn = async () => {
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
    if (error) alert(error.message);
};

window.captureFace = async () => {
    const video = document.getElementById('video');
    const status = document.getElementById('scan-status');
    const btn = document.getElementById('capture-btn');
    
    status.innerText = "Analyzing with AI...";
    btn.disabled = true;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

    try {
        const response = await fetch('/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image })
        });
        const data = await response.json();
        
        if (data.colors) {
            cubeFaces.push(data.colors);
            if (cubeFaces.length < 6) {
                document.getElementById('step-title').innerText = `Scan Face ${cubeFaces.length + 1} of 6`;
                status.innerText = `Success! Next: ${FACE_NAMES[cubeFaces.length]}`;
            } else {
                status.innerText = "All faces scanned! Calculating solution...";
                // Final solve logic would go here
            }
        }
    } catch (e) {
        status.innerText = "Error scanning. Try again.";
    }
    btn.disabled = false;
};

async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        document.getElementById('auth-gate').style.display = 'none';
        document.getElementById('app-interface').style.display = 'block';
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        document.getElementById('video').srcObject = stream;
    }
}

init();
