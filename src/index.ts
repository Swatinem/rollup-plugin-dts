import * as ts from "typescript";
import rollup from "rollup";
// @ts-ignore
import { createFilter } from "rollup-pluginutils";
import { getCompilerOptionsFromTsConfig } from "./options";
import resolveHost from "./resolveHost";
import { Transformer } from "./transformer";

interface Options {
  include?: Array<string>;
  exclude?: Array<string>;
  typescript?: typeof ts;
  tsconfig?: string;
  logAst?: boolean;
}

export default function dts(options: Options = {}): rollup.Plugin {
  const { typescript = ts } = options;
  const filter = createFilter(options.include || ["*.ts+(|x)", "**/*.ts+(|x)"], options.exclude || []);

  // This is mostly copied from:
  // https://github.com/rollup/rollup-plugin-typescript/blob/7f553800b90fc9abdcd13636b17b4824459d3960/src/index.js#L21-L57

  // Load options from `tsconfig.json` unless explicitly asked not to.
  const tsconfig: ts.CompilerOptions =
    typeof options.tsconfig === "string" ? getCompilerOptionsFromTsConfig(typescript, options.tsconfig) : {};
  tsconfig.skipLibCheck = true;
  tsconfig.declaration = true;
  // TODO: figure out how to correctly make declaration maps work
  // tsconfig.declarationMap = true;

  const parsed = typescript.convertCompilerOptionsFromJson(tsconfig, process.cwd());

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

    async transform(_code, id) {
      if (!filter(id)) {
        return;
      }

      // TODO: figure out how we can avoid creating a fresh typechecker all the time.
      const program = typescript.createProgram([id], compilerOptions);
      const sourceFile = program.getSourceFile(id)!;

      let dtsFilename = "";
      let code = "";
      let map = `{"mappings": ""}`;
      program.emit(sourceFile, (fileName, data) => {
        if (fileName.endsWith(".d.ts")) {
          dtsFilename = fileName;
          code = data;
        }
        // if (fileName.endsWith(".d.ts.map")) {
        //   map = data;
        // }
      });

      // console.log({ id, code });

      const dtsSource = typescript.createSourceFile(dtsFilename, code, ts.ScriptTarget.Latest);

      if (options.logAst) {
        console.log(code);
      }

      const converter = new Transformer(dtsSource, options);

      return {
        code,
        ast: converter.ast,
        map,
      };
    },
  };
}
