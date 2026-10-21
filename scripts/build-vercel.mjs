import { build } from "vite";
import { cp, lstat, mkdir, realpath, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
await build({ configFile: fileURLToPath(new URL("frontend/vite.config.js", projectRoot)) });
// Vercel's Express integration serves public/** through its CDN; express.static
// is ignored there. Local npm run build/start continues to serve dist normally.
const outputDirectory = resolve(await realpath(fileURLToPath(projectRoot)), "public");
await mkdir(outputDirectory, { recursive: true });
// Only reset this build's generated assets; never follow a redirected output folder.
if ((await lstat(outputDirectory)).isSymbolicLink() || await realpath(outputDirectory) !== outputDirectory) {
    throw new Error("Expected a local public output directory.");
}
const assetsDirectory = resolve(outputDirectory, "assets");
const existingAssets = await realpath(assetsDirectory).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
});
if (existingAssets && (existingAssets !== assetsDirectory || (await lstat(assetsDirectory)).isSymbolicLink())) {
    throw new Error("Expected generated assets inside the public output directory.");
}
await rm(assetsDirectory, { recursive: true, force: true });
await cp(new URL("dist/", projectRoot), outputDirectory, { recursive: true });
console.log("Vercel static assets prepared in public/.");
