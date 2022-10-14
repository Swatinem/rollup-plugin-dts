import { RollupWatchOptions } from "rollup";
import pkg from "./package.json";
import dts from "./src/index.js";

const external = ["module", "path", "typescript", "rollup", "@babel/code-frame", "magic-string"];

const config: Array<RollupWatchOptions> = [
  {
    input: "./.build/src/index.js",
    output: [
      { file: pkg.exports.import, format: "es" },
      { file: pkg.exports.require, format: "commonjs", exports: "named" },
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
