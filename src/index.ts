import * as ts from "typescript";
import { Plugin } from "rollup";
// @ts-ignore
import { createFilter } from "rollup-pluginutils";
import { getCachedCompiler } from "./compiler";

interface Options {
  include?: Array<string>;
  exclude?: Array<string>;
  tsconfig?: string;
  compilerOptions?: ts.CompilerOptions;
}

export default function dts(options: Options = {}): Plugin {
  const filter = createFilter(options.include || ["*.ts+(|x)", "**/*.ts+(|x)"], options.exclude || []);

  const compiler = getCachedCompiler({
    tsconfig: options.tsconfig || process.cwd(),
    compilerOptions: options.compilerOptions || {},
  });

  return {
    name: "dts",

    resolveId(importee, importer) {
      if (!importer) {
        return null;
      }
      importer = importer.split("\\").join("/");
      return compiler.resolve(importee, importer);
    },

    async transform(_code, id) {
      // istanbul ignore if
      if (!filter(id)) {
        return;
      }
      return compiler.transform(id);
    },
  };
}
