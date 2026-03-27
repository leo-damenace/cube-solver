// READ THE BRIDGE
const SB_URL = document.getElementById('sb-url').value;
const SB_KEY = document.getElementById('sb-key').value;

let supabaseClient;
if (SB_URL && SB_KEY) {
    supabaseClient = supabase.createClient(SB_URL, SB_KEY);
}

window.signIn = async () => {
    if (!supabaseClient) return alert("System not ready - Check Render Keys");
    await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
};

window.capture = async () => {
    const vid = document.getElementById('vid');
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
    canvas.getContext('2d').drawImage(vid, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg').split(',')[1];

    await fetch('/solve-4x4', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ image: base64, step: "Corner 1" })
    });
    alert("Photo sent!");
};

async function init() {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        document.getElementById('gate').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        document.getElementById('vid').srcObject = stream;
    }
}
init();
