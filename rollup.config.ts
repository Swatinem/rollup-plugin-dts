import * as fs from "node:fs";
import * as path from "node:path";
import type { Plugin, RollupWatchOptions } from "rollup";
import dts from "./src/index.js";

const pkg = JSON.parse(fs.readFileSync("./package.json", { encoding: "utf-8" }));
const external = ["node:module", "node:path", "node:fs", "node:fs/promises", "rollup", "@babel/code-frame", "magic-string", "@jridgewell/remapping", "@jridgewell/sourcemap-codec", "convert-source-map"];

// Substitute src/typescript-shim.mjs for `import ts from "typescript"` in the
// bundled output. The shim loads the compiler API from the user's `typescript`
// package, falling back to `@typescript/typescript6` for TypeScript 7, which
// does not ship a compiler API. Source files keep importing "typescript"
// directly so they get its types; only the published bundle is redirected.
const typescriptShim: Plugin = {
  name: "typescript-shim",
  resolveId(source) {
    if (source === "typescript") {
      return path.resolve("./src/typescript-shim.mjs");
    }
    return null;
  },
};

const config: Array<RollupWatchOptions> = [
  {
    input: "./.build/src/index.js",
    output: [
      { file: pkg.exports.import, format: "es" },
      { file: pkg.exports.require, format: "commonjs", exports: "named" },
    ],
    external,
    plugins: [typescriptShim],
  },
  {
    input: "./.build/src/index.d.ts",
    output: [
      { file: pkg.exports.import.replace(/\.mjs$/, ".d.mts") },
      { file: pkg.exports.require.replace(/\.cjs$/, ".d.cts") },
    ],
    plugins: [dts()],
  },
];

export default config;
