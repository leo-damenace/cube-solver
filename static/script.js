const SB_URL = "YOUR_SUPABASE_URL_HERE";
const SB_KEY = "YOUR_SUPABASE_ANON_KEY_HERE";
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let cubeFaces = []; // Stores the 6 scanned faces
let scanning = false;

// 1. GLOBAL LOGIN FUNCTION
window.signIn = async () => {
    console.log("Attempting Login...");
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
    if (error) alert("Error: " + error.message);
};

// 2. CAPTURE & AI ANALYSIS FUNCTION
window.capture = async () => {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    const imageData = canvas.toDataURL('image/jpeg').split(',')[1];
    console.log("Image captured, sending to Gemini...");

    try {
        const response = await fetch('/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });
        
        const data = await response.json();
        if (data.colors) {
            cubeFaces.push(data.colors);
            alert(`Face ${cubeFaces.length} scanned!`);
            if (cubeFaces.length === 6) {
                alert("All faces scanned. Calculating solution...");
                processSolve();
            }
        }
    } catch (err) {
        console.error("AI Error:", err);
    }
};

// 3. INITIALIZATION & AUTH CHECK
async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        document.getElementById('auth-gate').style.display = 'none';
        document.getElementById('app-interface').style.display = 'block';
        startCamera();
    }
}

// 4. CAMERA CONTROL
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        document.getElementById('video').srcObject = stream;
    } catch (err) {
        alert("Camera access denied or not found.");
    }
}

// 5. FINAL SOLVE LOGIC
async function processSolve() {
    // This sends the 6 faces to your Python backend to get the move sequence
    const response = await fetch('/get-moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faces: cubeFaces })
    });
    const result = await response.json();
    console.log("Solution moves:", result.moves);
}

init();
