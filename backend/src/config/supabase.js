import { createClient } from "@supabase/supabase-js";

// Use a separate client for each request to isolate user sessions.
export function createSupabaseClient() {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        const error = new Error("Supabase is not configured.");
        error.status = 503;
        throw error;
    }
    return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
}
