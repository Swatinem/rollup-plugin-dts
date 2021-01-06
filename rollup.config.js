import pkg from "./package.json";
// @ts-ignore
import dts from "./.build/src/index.js";

const external = ["path", "typescript", "rollup", "@babel/code-frame", "magic-string"];

/** @type {Array<import("rollup").RollupWatchOptions>} */
const config = [
  {
    input: "./.build/src/index.js",
    output: [
      { exports: "named", file: pkg.main, format: "cjs" },
      { file: pkg.module, format: "es" },
    ],

    external,
  },
  {
    input: "./.build/src/index.d.ts",
    output: [{ file: pkg.types, format: "es" }],
    plugins: [dts()],
  },
];

export default config;
