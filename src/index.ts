import * as ts from "typescript";
import rollup from "rollup";
// @ts-ignore
import { createFilter } from "rollup-pluginutils";
import { getCompilerOptionsFromTsConfig } from "./options";
import resolveHost from "./resolveHost";
import { ProgramConverter } from "./convert";

interface Options {
  include?: Array<string>;
  exclude?: Array<string>;
  typescript?: typeof ts;
  tsconfig?: unknown;
}

export default function dts(options: Options = {}): rollup.Plugin {
  const {
    // Allow users to override the TypeScript version used for transpilation and tslib version used for helpers.
    typescript = ts,
  } = options;
  let { tsconfig } = options;
  const filter = createFilter(options.include || ["*.ts+(|x)", "**/*.ts+(|x)"], options.exclude || []);

  // This is mostly copied from:
  // https://github.com/rollup/rollup-plugin-typescript/blob/7f553800b90fc9abdcd13636b17b4824459d3960/src/index.js#L21-L57

  // Load options from `tsconfig.json` unless explicitly asked not to.
  if (typeof tsconfig === "string") {
    tsconfig = getCompilerOptionsFromTsConfig(typescript, tsconfig);
  }

  const parsed = typescript.convertCompilerOptionsFromJson(options, process.cwd());

  if (parsed.errors.length) {
    parsed.errors.forEach(error => console.error(`rollup-plugin-dts: ${error.messageText}`));

    throw new Error(`rollup-plugin-dts: Couldn't process compiler options`);
  }

  const compilerOptions = parsed.options;

  return {
    name: "dts",

    // This is mostly copied from:
    // https://github.com/rollup/rollup-plugin-typescript/blob/7f553800b90fc9abdcd13636b17b4824459d3960/src/index.js#L62-L81
    resolveId(importee, importer) {
      if (!importer) {
        return null;
      }
      importer = importer.split("\\").join("/");

      const result = typescript.nodeModuleNameResolver(importee, importer, compilerOptions, resolveHost as any);

      if (result.resolvedModule && result.resolvedModule.resolvedFileName) {
        return result.resolvedModule.resolvedFileName;
      }

      return null;
    },

    async transform(code, id) {
      if (!filter(id)) {
        return;
      }

      const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.ESNext, /*setParentNodes */ false);
      const converter = new ProgramConverter(sourceFile);
      const emptyMap = { mappings: "" as "" };

      return {
        code,
        ast: converter.ast,
        map: emptyMap,
      };
    },
  };
}
