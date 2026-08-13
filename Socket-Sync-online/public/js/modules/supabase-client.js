
// ================= SUPABASE CLIENT =================
// Initialize the Supabase client
// Requires the Supabase JS library to be loaded in the HTML (via CDN)

const SUPABASE_URL = "https://zxeetbzheedapqnnhqob.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4ZWV0YnpoZWVkYXBxbm5ocW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNDM2MTIsImV4cCI6MjA4NjYxOTYxMn0.eS5olENoHHsYvm3ZifEMNt2pNhcrpibq3KMIcGAcy14";

// 1. Check if 'supabase' exists (could be Lib or Client)
if (window.supabase) {
    if (window.supabase.createClient) {
        // It's the Library! We need to initialize.
        window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log("Supabase Client Initialized (from window.supabase)");
    } else if (window.supabase.auth) {
        // It's already the Client (has auth). Do nothing.
        console.log("Supabase Client already ready");
    }
}
// 2. Check uppercase 'Supabase' (alternative CDN export)
else if (window.Supabase && window.Supabase.createClient) {
    window.supabase = window.Supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client Initialized (from window.Supabase)");
}
// 3. Fallback: Global createClient?
else if (typeof createClient !== 'undefined') {
    window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client Initialized (from global createClient)");
}
// 4. Critical Failure
else {
    console.error("CRITICAL: Supabase Library not loaded. Check CDN link.");
}
