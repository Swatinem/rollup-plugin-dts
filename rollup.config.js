import pkg from "./package.json";

// @ts-ignore
require = require("esm")(module);
const { default: dts } = require("./.build");

const external = ["typescript", "rollup", "@babel/code-frame"];

/** @type {Array<import("rollup").RollupWatchOptions>} */
const config = [
  {
    input: "./.build/index.js",
    output: [{ exports: "named", file: pkg.main, format: "cjs" }, { file: pkg.module, format: "es" }],

    external,
  },
  {
    input: "./.build/index.d.ts",
    output: [{ file: pkg.types, format: "es" }],

    external,

    plugins: [dts()],
  },
];

export default config;
