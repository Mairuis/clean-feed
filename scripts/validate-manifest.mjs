import { access, readFile } from "node:fs/promises";

const manifestPath = process.argv[2] || "manifest.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const baseDir = manifestPath.includes("/") ? manifestPath.split("/").slice(0, -1).join("/") : ".";
const required = [
  manifest.background?.service_worker,
  ...(manifest.content_scripts?.flatMap((script) => script.js ?? []) ?? []),
  manifest.action?.default_popup,
  manifest.options_ui?.page
].filter(Boolean);

if (manifest.name !== "Clean Feed") {
  throw new Error("manifest name must be Clean Feed");
}

if (!manifest.host_permissions?.some((item) => item.includes("bilibili.com"))) {
  throw new Error("Bilibili host permission is missing");
}

for (const path of required) {
  if (typeof path !== "string") {
    throw new Error("manifest contains a non-string path");
  }

  await access(`${baseDir}/${path}`);
}

console.log("manifest ok");
