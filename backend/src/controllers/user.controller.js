import { createSupabaseClient } from "../config/supabase.js";

const validCredentials = (email, password) =>
    typeof email === "string" && email.trim().includes("@") &&
    typeof password === "string" && password.length > 0;

export async function registerUser(req, res) {
    const { username, email, password } = req.body ?? {};
    if (!validCredentials(email, password) || typeof username !== "string" ||
        !/^[a-zA-Z0-9_]{3,25}$/.test(username) || password.length < 10) {
        return res.status(400).json({ message: "Provide a valid email, a password of at least 10 characters, and a username of 3-25 letters, numbers, or underscores." });
    }
    const { data, error } = await createSupabaseClient().auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { username } },
    });
    if (error) return res.status(400).json({ message: "Registration failed. Check your details and try again." });
    return res.status(201).json({ message: "Check your email if confirmation is enabled.", user: data.user, session: data.session });
}

export async function loginUser(req, res) {
    const { email, password } = req.body ?? {};
    if (!validCredentials(email, password)) {
        return res.status(400).json({ message: "Email and password are required." });
    }
    const { data, error } = await createSupabaseClient().auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
    });
    if (error) return res.status(401).json({ message: "Invalid credentials or unconfirmed email." });
    return res.json({ user: data.user, session: data.session });
}

export async function logoutUser(req, res) {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? "");
    const { refresh_token } = req.body ?? {};
    if (!match || typeof refresh_token !== "string" || !refresh_token) {
        return res.status(400).json({ message: "A Bearer access token and refresh_token are required." });
    }
    const supabase = createSupabaseClient();
    const { error: sessionError } = await supabase.auth.setSession({
        access_token: match[1], refresh_token,
    });
    if (sessionError) return res.status(401).json({ message: "Invalid session." });
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return res.status(401).json({ message: "Unable to sign out." });
    return res.json({ message: "Signed out. Remove stored tokens from your client." });
}
