// This module replaces `import ts from "typescript"` in the bundled output
// (see the typescript-shim plugin in rollup.config.ts).
//
// TypeScript 7 (the native compiler) does not ship a compiler API — it only
// exports `version`. Until the new API arrives in TypeScript 7.1+, users on
// typescript@7 need the `@typescript/typescript6` compatibility package,
// which provides the TypeScript 6.0 API.
//
// `require` is used instead of static imports so that a missing or API-less
// `typescript` package can be detected and recovered from at runtime.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadTypeScript() {
  let ts;
  try {
    ts = require("typescript");
  } catch {
    // not installed, or an ESM-only entry point that this Node version cannot `require`
  }
  if (ts && typeof ts.createProgram === "function") {
    return ts;
  }
  try {
    return require("@typescript/typescript6");
  } catch {
    if (ts) {
      throw new Error(
        `rollup-plugin-dts requires the TypeScript compiler API. The installed typescript@${ts.version} does not provide it, ` +
          "and the `@typescript/typescript6` fallback is not installed.\n" +
          "TypeScript 7 does not ship a compiler API, so please additionally install the compatibility package:\n" +
          "  npm install -D @typescript/typescript6",
      );
    }
    throw new Error(
      "rollup-plugin-dts requires the TypeScript compiler API, but the `typescript` package could not be loaded.\n" +
        "Please install typescript 4.5 - 6.x, or typescript 7 together with the `@typescript/typescript6` compatibility package:\n" +
        "  npm install -D typescript",
    );
  }
}

export default loadTypeScript();
