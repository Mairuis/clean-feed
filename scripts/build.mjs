import esbuild from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const releaseDir = "release/clean-feed";

await rm("dist", { force: true, recursive: true });
await rm("release", { force: true, recursive: true });

await esbuild.build({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
    options: "src/options.ts"
  },
  bundle: true,
  outdir: "dist",
  entryNames: "[name]",
  format: "iife",
  platform: "browser",
  target: ["chrome121"],
  minify: true,
  sourcemap: false,
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": "\"production\""
  }
});

await mkdir(releaseDir, { recursive: true });

await Promise.all([
  cp("manifest.json", `${releaseDir}/manifest.json`),
  cp("content.css", `${releaseDir}/content.css`),
  cp("popup.css", `${releaseDir}/popup.css`),
  cp("popup.html", `${releaseDir}/popup.html`),
  cp("options.css", `${releaseDir}/options.css`),
  cp("options.html", `${releaseDir}/options.html`),
  cp("dist", `${releaseDir}/dist`, { recursive: true })
]);
