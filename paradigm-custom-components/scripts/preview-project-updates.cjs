// node scripts/preview-project-updates.cjs ; open http://127.0.0.1:4317
const esbuild = require("esbuild");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const outdir = path.resolve(__dirname, "../.updates-preview");
(async () => {
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, "../preview/project-updates.tsx")],
    bundle: true,
    outdir,
    jsx: "automatic",
    plugins: [
      {
        name: "retool-preview-stub",
        setup(build) {
          build.onResolve(
            { filter: /^@tryretool\/custom-component-support$/ },
            () => ({ path: "stub", namespace: "retool-preview" }),
          );
          build.onLoad({ filter: /.*/, namespace: "retool-preview" }, () => ({
            contents: "export const Retool = {};",
            loader: "js",
          }));
        },
      },
    ],
  });
  http
    .createServer((req, res) => {
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project Updates · Local Preview</title><link rel="stylesheet" href="/project-updates.css"></head><body style="margin:0"><div id="root"></div><script src="/project-updates.js"></script></body></html>',
        );
        return;
      }
      const name =
        req.url === "/project-updates.js"
          ? "project-updates.js"
          : req.url === "/project-updates.css"
            ? "project-updates.css"
            : null;
      if (!name) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.setHeader(
        "Content-Type",
        name.endsWith("css") ? "text/css" : "application/javascript",
      );
      res.end(fs.readFileSync(path.join(outdir, name)));
    })
    .listen(4317, "127.0.0.1", () =>
      console.log("Local preview: http://127.0.0.1:4317 (fixture data only)"),
    );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
