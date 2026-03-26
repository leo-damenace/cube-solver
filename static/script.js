// This is fine to be public
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-public-anon-key'; 

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function captureAndScan() {
    // We send the image to OUR server (/scan-face), NOT directly to Google.
    // This keeps the Gemini Key hidden on the backend.
    const res = await fetch("/scan-face", {
        method: "POST",
        body: JSON.stringify({ image: canvas.toDataURL() })
    });
    // ...
}
