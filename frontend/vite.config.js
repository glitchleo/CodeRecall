import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => {
    const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
    const apiPort = process.env.PORT || loadEnv(mode, rootDirectory, "").PORT || "8000";
    return {
        root: fileURLToPath(new URL("./", import.meta.url)),
        build: {
            outDir: fileURLToPath(new URL("../dist", import.meta.url)),
            emptyOutDir: true,
        },
        server: {
            host: "127.0.0.1",
            port: 5173,
            strictPort: true,
            proxy: { "/api": `http://127.0.0.1:${apiPort}` },
        },
    };
});
