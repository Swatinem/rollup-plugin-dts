// @ts-ignore
import json from "rollup-plugin-json";
import pkg from "./package.json";

require("ts-node").register({ transpileOnly: true });
const { ts, dts } = require("./src");

const external = ["fs", "path", "typescript", "rollup-pluginutils", "rollup", "@babel/code-frame"];

/** @type {Array<import("rollup").RollupWatchOptions>} */
const config = [
  {
    input: "./src/index.ts",
    output: [
      {
        exports: "named",
        file: pkg.main,
        format: "cjs",
      },
      { file: pkg.module, format: "es" },
    ],

    external,
    plugins: [
      json({
        preferConst: true,
        indent: "  ",
      }),
      ts(),
    ],
  },
  {
    input: "./src/index.ts",
    output: [{ file: pkg.types, format: "es" }],

    external,

    plugins: [dts()],
  },
];

export default config;
