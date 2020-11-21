import pkg from "./package.json";

// @ts-ignore
require = require("esm")(module);
const { default: dts } = require("./.build");

const external = ["path", "typescript", "rollup", "@babel/code-frame", "magic-string"];

/** @type {Array<import("rollup").RollupWatchOptions>} */
const config = [
  {
    input: "./.build/index.js",
    output: [
      { exports: "named", file: pkg.main, format: "cjs" },
      { file: pkg.module, format: "es" },
    ],

    external,
  },
  {
    input: "./.build/index.d.ts",
    output: [{ file: pkg.types, format: "es" }],
    plugins: [dts()],
  },
];

export default config;
