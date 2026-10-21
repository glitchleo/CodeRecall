import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", (_req, res) => res.status(404).json({ message: "Route not found" }));

const frontendDirectory = fileURLToPath(new URL("../../dist/", import.meta.url));
const frontendIndex = fileURLToPath(new URL("../../dist/index.html", import.meta.url));
if (existsSync(frontendIndex)) {
    app.use(express.static(frontendDirectory));
    app.use((req, res, next) => {
        if (req.method === "GET" && req.get("accept")?.includes("text/html")) {
            return res.sendFile(frontendIndex);
        }
        next();
    });
} else {
    app.get("/", (_req, res) => res.json({ name: "CodeRecall API", health: "/api/health" }));
}

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use((error, _req, res, _next) => {
    const status = error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(status).json({ message: status === 400 ? "Invalid request." : status === 413 ? "Request body too large." : "Internal server error" });
});
export default app;
