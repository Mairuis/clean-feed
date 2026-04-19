import { access, readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
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

  await access(path);
}

console.log("manifest ok");
