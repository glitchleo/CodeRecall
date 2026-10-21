import test from "node:test";
import assert from "node:assert/strict";
import {
  cloudConfiguration, snapshotLibrary, uploadCloudLibrary, downloadCloudLibrary,
  inspectCloudLibrary, preserveLocalLibrary, getRecoveryLibrary, CloudConflictError,
  RECOVERY_KEY, MAX_SNAPSHOT_BYTES,
} from "../src/lib/cloud.js";

const timestamp = "2026-10-21T12:00:00.000Z";
function library() {
  return { version: 2, tags: [{ id: "math", name: "Math" }], nodes: [{
    id: "sum", name: "sum.js", type: "file", parentId: null,
    starred: false, createdAt: timestamp, updatedAt: timestamp,
    content: "const add = (a, b) => a + b;", tagIds: ["math"],
    description: "Add numbers", iconId: "javascript",
  }] };
}

function fakeClient(result) {
  const calls = [];
  const query = {};
  for (const method of ["from", "select", "eq", "insert", "update"]) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.maybeSingle = async () => result;
  return { client: query, calls };
}

test("cloud configuration is optional and refuses privileged browser keys", () => {
  assert.equal(cloudConfiguration({}).configured, false);
  assert.equal(cloudConfiguration({ VITE_SUPABASE_URL: "https://example.supabase.co" }).configured, false);
  const env = { VITE_SUPABASE_URL: "https://example.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example" };
  assert.equal(cloudConfiguration(env).configured, true);
  assert.equal(cloudConfiguration({ ...env, VITE_SUPABASE_URL: "file:///tmp/" }).configured, false);
  assert.equal(cloudConfiguration({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private" }).configured, false);
  const jwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  assert.equal(cloudConfiguration({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: jwt }).configured, false);
});

test("snapshots preserve code, descriptions, icons, and tags in an independent validated copy", () => {
  const original = library();
  const snapshot = snapshotLibrary(original);
  assert.deepEqual(snapshot, original);
  snapshot.nodes[0].content = "changed";
  assert.notEqual(original.nodes[0].content, snapshot.nodes[0].content);
  assert.throws(() => snapshotLibrary({ ...original, tags: [] }), /invalid/i);
  assert.throws(() => snapshotLibrary({ version: 999, nodes: [], tags: [] }), /invalid/i);
});

test("new cloud uploads insert only for the requested user; existing revisions compare atomically", async () => {
  const inserted = fakeClient({ data: { revision: 1, updated_at: timestamp }, error: null });
  await uploadCloudLibrary(inserted.client, "user-one", library(), 0);
  assert.deepEqual(inserted.calls.find(([method]) => method === "insert"), ["insert", { user_id: "user-one", library: library() }]);
  const updated = fakeClient({ data: { revision: 8, updated_at: timestamp }, error: null });
  const metadata = await uploadCloudLibrary(updated.client, "user-two", library(), 7);
  assert.equal(metadata.revision, 8);
  assert.ok(updated.calls.some(call => call[0] === "eq" && call[1] === "user_id" && call[2] === "user-two"));
  assert.ok(updated.calls.some(call => call[0] === "eq" && call[1] === "revision" && call[2] === 7));
  assert.deepEqual(updated.calls.find(([method]) => method === "update"), ["update", { library: library() }]);
});

test("stale updates and simultaneous first uploads surface conflicts without a retry overwrite", async () => {
  const stale = fakeClient({ data: null, error: null });
  await assert.rejects(() => uploadCloudLibrary(stale.client, "user", library(), 3), CloudConflictError);
  assert.equal(stale.calls.filter(call => call[0] === "update").length, 1);
  const duplicate = fakeClient({ data: null, error: { code: "23505" } });
  await assert.rejects(() => uploadCloudLibrary(duplicate.client, "user", library(), 0), CloudConflictError);
  assert.equal(duplicate.calls.some(call => call[0] === "update"), false);
});

test("inspect and download constrain ownership; malformed or absent remote snapshots are rejected", async () => {
  const metadata = fakeClient({ data: { revision: 2, updated_at: timestamp }, error: null });
  await inspectCloudLibrary(metadata.client, "user");
  assert.deepEqual(metadata.calls.find(call => call[0] === "select"), ["select", "revision, updated_at"]);
  const remote = fakeClient({ data: { library: library(), revision: 2, updated_at: timestamp }, error: null });
  assert.deepEqual((await downloadCloudLibrary(remote.client, "user")).library, library());
  assert.ok(remote.calls.some(call => call[0] === "eq" && call[1] === "user_id" && call[2] === "user"));
  await assert.rejects(() => downloadCloudLibrary(fakeClient({ data: null }).client, "user"), /no cloud library/i);
  await assert.rejects(() => downloadCloudLibrary(fakeClient({ data: { library: { version: 8 } } }).client, "user"), /invalid/i);
});

test("invalid ownership, missing revision, and oversized snapshots never send writes", async () => {
  const mock = fakeClient({ data: null, error: null });
  await assert.rejects(() => uploadCloudLibrary(mock.client, "", library(), 0), /sign in/i);
  await assert.rejects(() => uploadCloudLibrary(mock.client, "user", library(), null), /status/i);
  const large = library();
  large.nodes[0].content = "x".repeat(MAX_SNAPSHOT_BYTES);
  await assert.rejects(() => uploadCloudLibrary(mock.client, "user", large, 0), /4 MiB/i);
  assert.equal(mock.calls.length, 0);
});

test("recovery retains one usable library and refuses replacement when backup storage fails", () => {
  const stored = new Map();
  const storage = { setItem: (key, value) => stored.set(key, value), getItem: key => stored.get(key) ?? null };
  assert.equal(getRecoveryLibrary(storage), null);
  assert.deepEqual(preserveLocalLibrary(library(), storage), library());
  assert.ok(stored.has(RECOVERY_KEY));
  assert.deepEqual(getRecoveryLibrary(storage), library());
  assert.throws(() => preserveLocalLibrary(library(), { setItem() { throw new Error("QuotaExceededError"); } }), /recovery copy/i);
  stored.set(RECOVERY_KEY, "broken json");
  assert.equal(getRecoveryLibrary(storage), null);
});

test("cloud errors explain a missing migration and denied row access", async () => {
  await assert.rejects(() => inspectCloudLibrary(fakeClient({ error: { code: "PGRST205" } }).client, "user"), /migration/i);
  await assert.rejects(() => inspectCloudLibrary(fakeClient({ error: { code: "42501" } }).client, "user"), /row security/i);
});
