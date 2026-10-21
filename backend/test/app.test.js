import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import app from "../../app.js";

let server;
let url;

before(async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    url = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server?.listening) {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});

test("API health responds with JSON and no framework header", async () => {
    const response = await fetch(url + "/api/health");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^application\/json\b/);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.deepEqual(await response.json(), { status: "ok" });
});

test("unknown API and non-API routes respond with JSON", async () => {
    for (const path of ["/api/missing", "/missing"]) {
        const response = await fetch(url + path);
        assert.equal(response.status, 404);
        assert.match(response.headers.get("content-type"), /^application\/json\b/);
        assert.deepEqual(await response.json(), { message: "Route not found" });
    }
});

test("malformed JSON responds with a safe validation error", async () => {
    const response = await fetch(url + "/api/missing", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "Invalid request." });
});

test("JSON exceeding the size limit responds with a safe size error", async () => {
    const response = await fetch(url + "/api/missing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(17 * 1024) }),
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { message: "Request body too large." });
});
