import { PluginImpl } from "rollup";
import ts from "typescript";
import { NamespaceFixer } from "./NamespaceFixer.js";
import { preProcess } from "./preprocess.js";
import { convert } from "./Transformer.js";

export interface TransformOptions {}

function parse(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
}

export const transform: PluginImpl<TransformOptions> = () => {
  const allTypeReferences = new Map<string, Set<string>>();

  return {
    name: "dts-transform",

    options(options) {
      const { onwarn } = options;

      return {
        ...options,
        onwarn(warning, warn) {
          if (warning.code != "CIRCULAR_DEPENDENCY") {
            if (onwarn) {
              onwarn(warning, warn);
            } else {
              warn(warning);
            }
          }
        },
        treeshake: {
          moduleSideEffects: "no-external",
          propertyReadSideEffects: true,
          unknownGlobalSideEffects: false,
        },
      };
    },

    outputOptions(options) {
      return {
        ...options,
        chunkFileNames: options.chunkFileNames || "[name]-[hash].d.ts",
        entryFileNames: options.entryFileNames || "[name].d.ts",
        format: "es",
        exports: "named",
        compact: false,
        freeze: true,
        interop: false,
        namespaceToStringTag: false,
        strict: false,
      };
    },

    transform(code, fileName) {
      let sourceFile = parse(fileName, code);
      const preprocessed = preProcess({ sourceFile });
      // `sourceFile.fileName` here uses forward slashes
      allTypeReferences.set(sourceFile.fileName, preprocessed.typeReferences);

      code = preprocessed.code.toString();

      sourceFile = parse(fileName, code);
      const converted = convert({ sourceFile });

      if (process.env.DTS_DUMP_AST) {
        console.log(fileName);
        console.log(code);
        console.log(JSON.stringify(converted.ast.body, undefined, 2));
      }

      return { code, ast: converted.ast as any, map: preprocessed.code.generateMap() };
    },

    renderChunk(code, chunk) {
      const source = parse(chunk.fileName, code);
      const fixer = new NamespaceFixer(source);

      const typeReferences = new Set<string>();
      for (const fileName of Object.keys(chunk.modules)) {
        for (const ref of allTypeReferences.get(fileName.split("\\").join("/")) || []) {
          typeReferences.add(ref);
        }
      }

      code = writeBlock(Array.from(typeReferences, (ref) => `/// <reference types="${ref}" />`));
      code += fixer.fix();

      return { code, map: { mappings: "" } };
    },
  };
};

function writeBlock(codes: Array<string>): string {
  if (codes.length) {
    return codes.join("\n") + "\n";
  }
  return "";
}
