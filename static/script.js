const url = document.getElementById('url').value;
const key = document.getElementById('key').value;
const supabaseClient = supabase.createClient(url, key);

async function signIn() {
    await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
}

async function capture() {
    const vid = document.getElementById('vid');
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
    canvas.getContext('2d').drawImage(vid, 0, 0);
    const img = canvas.toDataURL('image/jpeg').split(',')[1];

    await fetch('/solve-4x4', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ image: img, step: "Corner Scan" })
    });
    alert("Sent to AI!");
}

async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        document.getElementById('gate').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        document.getElementById('vid').srcObject = stream;
    }
}
init();
