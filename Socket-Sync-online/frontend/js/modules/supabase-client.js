
// ================= SUPABASE CLIENT =================
// Initialize the Supabase client
// Requires the Supabase JS library to be loaded in the HTML (via CDN)

const SUPABASE_URL = "https://zxeetbzheedapqnnhqob.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4ZWV0YnpoZWVkYXBxbm5ocW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNDM2MTIsImV4cCI6MjA4NjYxOTYxMn0.eS5olENoHHsYvm3ZifEMNt2pNhcrpibq3KMIcGAcy14";

// Check if supabase is defined (loaded via CDN)
// Check if supabase is defined (loaded via CDN)
let supabase;

// The CDN exposes the library as 'supabase' or 'Supabase' on window.
// We need to extract createClient from it.
const lib = window.supabase || window.Supabase;

if (lib && lib.createClient) {
    supabase = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client Initialized");
} else if (typeof createClient !== 'undefined') {
    // Fallback if createClient is somehow global (unlikely for v2 CDN)
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase Client Initialized (Global)");
} else {
    console.error("Supabase JS Library not found! Make sure to include the CDN link in your HTML.");
}

// Export if using ES modules, but globals.js usage suggests global scope.
// We'll keep it in global scope for now to match current architecture.
window.supabase = supabase;
