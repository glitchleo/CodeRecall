import { createClient } from "@supabase/supabase-js";
import { decodeLibrary } from "./tags.js";

export const CLOUD_TABLE = "library_snapshots";
export const RECOVERY_KEY = "coderecall.library.before-cloud.v1";
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
let cachedClient;

export function cloudConfiguration(env = import.meta.env ?? {}) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return { configured: false, message: "Cloud is optional. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild to enable it." };
  try {
    if (!["https:", "http:"].includes(new URL(url).protocol)) throw new Error();
    // Never accept an elevated key in a browser, including legacy service-role JWTs.
    let role;
    if (key.split(".").length === 3) {
      try { role = JSON.parse(globalThis.atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role; } catch { /* Let Supabase report malformed public keys. */ }
    }
    if (key.startsWith("sb_secret_") || role === "service_role") return { configured: false, message: "Use a Supabase publishable key in the frontend. Remove the secret/service-role key and rotate it if it was deployed." };
    return { configured: true, url, key };
  } catch {
    return { configured: false, message: "VITE_SUPABASE_URL must be your project's HTTP(S) URL." };
  }
}

export function getCloudClient() {
  const configuration = cloudConfiguration();
  if (!configuration.configured) return null;
  cachedClient ??= createClient(configuration.url, configuration.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
  });
  return cachedClient;
}

export class CloudConflictError extends Error {
  constructor() {
    super("The cloud library changed on another device. Download and review that version before uploading again. Your local library has not changed.");
    this.name = "CloudConflictError";
  }
}

export function snapshotLibrary(value, { maxBytes = MAX_SNAPSHOT_BYTES } = {}) {
  const decoded = decodeLibrary(value);
  if (!decoded) throw new Error("This library has invalid files, folders, or tags. It was not transferred.");
  const json = JSON.stringify(decoded);
  if (new TextEncoder().encode(json).byteLength > maxBytes) throw new Error("The library exceeds the 4 MiB cloud snapshot limit. Export a local backup and reduce its size before uploading.");
  return JSON.parse(json);
}

function cloudError(error) {
  if (error?.code === "23505") return new CloudConflictError();
  if (["42P01", "PGRST205"].includes(error?.code)) return new Error("The cloud table is missing. Run the library_snapshots migration in Supabase SQL Editor, then try again.");
  if (error?.code === "42501") return new Error("Cloud access was denied. Sign in again and check the Supabase row security policies in the deployment guide.");
  return new Error(error?.message || "Could not contact Supabase. Check your connection and try again.");
}

function requireUser(userId) {
  if (typeof userId !== "string" || !userId.trim()) throw new Error("Sign in before transferring a library.");
}

export async function inspectCloudLibrary(client, userId) {
  requireUser(userId);
  const { data, error } = await client.from(CLOUD_TABLE).select("revision, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw cloudError(error);
  return data;
}

export async function downloadCloudLibrary(client, userId) {
  requireUser(userId);
  const { data, error } = await client.from(CLOUD_TABLE).select("library, revision, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw cloudError(error);
  if (!data) throw new Error("This account has no cloud library yet. Upload it from your other device first.");
  return { ...data, library: snapshotLibrary(data.library) };
}

/** Compare the revision at the database, so two devices cannot silently overwrite each other. */
export async function uploadCloudLibrary(client, userId, library, expectedRevision) {
  requireUser(userId);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error("Check the cloud status before uploading.");
  const snapshot = snapshotLibrary(library);
  const table = client.from(CLOUD_TABLE);
  const request = expectedRevision === 0
    ? table.insert({ user_id: userId, library: snapshot })
    : table.update({ library: snapshot }).eq("user_id", userId).eq("revision", expectedRevision);
  const { data, error } = await request.select("revision, updated_at").maybeSingle();
  if (error) throw cloudError(error);
  if (!data) throw new CloudConflictError();
  return data;
}

/** Keep one recovery snapshot before a confirmed download replaces the local library. */
export function preserveLocalLibrary(library, storage) {
  const snapshot = snapshotLibrary(library, { maxBytes: Infinity });
  try { (storage ?? globalThis.localStorage).setItem(RECOVERY_KEY, JSON.stringify(snapshot)); }
  catch { throw new Error("There is not enough browser storage for a recovery copy. Export a backup and free some storage before replacing this library."); }
  return snapshot;
}

export function getRecoveryLibrary(storage) {
  try { return decodeLibrary(JSON.parse((storage ?? globalThis.localStorage).getItem(RECOVERY_KEY))); }
  catch { return null; }
}
