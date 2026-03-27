// Fetching keys from the hidden inputs (which Python filled from Render)
const SB_URL = document.getElementById('sb-url').value;
const SB_KEY = document.getElementById('sb-key').value;
const supabaseClient = supabase.createClient(SB_URL, SB_KEY);

let activeColor = 'white';
let currentPhoto = 0;
const photoSteps = ["Corner 1", "Corner 2", "Middles 1", "Middles 2"];

window.signIn = async () => {
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
};

window.setTool = (color) => { activeColor = color; };

window.capture = async () => {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg').split(',')[1];

    const res = await fetch('/analyze-batch', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ image: base64, type: photoSteps[currentPhoto] })
    });
    const data = await res.json();
    console.log("AI Analysis:", data.analysis);
    
    currentPhoto++;
    if(currentPhoto < 4) {
        document.getElementById('step-text').innerText = `Photo ${currentPhoto + 1}: ${photoSteps[currentPhoto]}`;
    }
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
