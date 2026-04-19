import esbuild from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist", { force: true, recursive: true });

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
  sourcemap: true,
  legalComments: "none",
  define: {
    "process.env.NODE_ENV": "\"production\""
  }
});
