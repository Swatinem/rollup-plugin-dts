// @ts-ignore
import json from "rollup-plugin-json";
// @ts-ignore
import resolve from "rollup-plugin-node-resolve";
// @ts-ignore
import typescript from "rollup-plugin-typescript";
import pkg from "./package.json";

/**
 * @type {import("rollup").InputOptions}
 */
const config = {
  input: "./src/index.ts",
  output: [{ file: pkg.main, format: "cjs" }, { file: pkg.module, format: "es" }],

  external: ["fs", "path", "typescript", "rollup-pluginutils", "rollup"],
  // @ts-ignore: this option is not in the @types
  treeshake: {
    pureExternalModules: true,
  },

  plugins: [
    resolve({
      jsnext: true,
      extensions: [".ts"],
    }),
    json({
      preferConst: true,
      indent: "  ",
    }),
    typescript(),
  ],
};

export default config;
