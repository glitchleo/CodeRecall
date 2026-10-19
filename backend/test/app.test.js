import test from "node:test";
import assert from "node:assert/strict";
import app from "../../app.js";

test("API health, validation, and error responses", async () => {
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
        const health = await fetch(url + "/api/health");
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: "ok" });
        assert.equal((await fetch(url + "/missing")).status, 404);
        for (const route of ["register", "login", "logout"]) {
            const response = await fetch(url + "/api/v1/users/" + route, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
            });
            assert.equal(response.status, 400);
        }
        const invalid = await fetch(url + "/api/v1/users/login", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
        });
        assert.equal(invalid.status, 400);
        const previous = process.env.SUPABASE_URL;
        delete process.env.SUPABASE_URL;
        try {
            const response = await fetch(url + "/api/v1/users/login", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: "test@example.com", password: "test-password" }),
            });
            assert.equal(response.status, 503);
        } finally {
            if (previous !== undefined) process.env.SUPABASE_URL = previous;
        }
    } finally {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});
