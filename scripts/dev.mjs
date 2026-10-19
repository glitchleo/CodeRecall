import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const isWindows = process.platform === "win32";
const children = [];
let stopping = false;

function stopChild(child) {
    if (!child.pid || child.exitCode !== null) return Promise.resolve();
    if (isWindows) {
        return new Promise((resolve) => {
            const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
                stdio: "ignore",
                windowsHide: true,
            });
            killer.once("exit", resolve);
            killer.once("error", () => { child.kill(); resolve(); });
        });
    }
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already stopped. */ }
    return Promise.resolve();
}

async function shutdown(code = 0) {
    if (stopping) return;
    stopping = true;
    await Promise.all(children.map(stopChild));
    process.exit(code);
}

function run(name, args) {
    const child = spawn(process.execPath, args, {
        cwd: root,
        stdio: "inherit",
        detached: !isWindows,
        windowsHide: true,
    });
    children.push(child);
    child.once("error", (error) => {
        console.error(`${name} failed to start: ${error.message}`);
        void shutdown(1);
    });
    child.once("exit", (code, signal) => {
        if (!stopping) {
            console.log(`${name} stopped${signal ? ` (${signal})` : ""}.`);
            void shutdown(code ?? 1);
        }
    });
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

run("API", ["--watch", "backend/src/index.js"]);
run("Frontend", ["node_modules/vite/bin/vite.js", "--config", "frontend/vite.config.js"]);
