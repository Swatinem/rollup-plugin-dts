import * as path from "node:path";
import type { Plugin } from "rollup";
import { NamespaceFixer } from "./NamespaceFixer.js";
import { preProcess } from "./preprocess.js";
import { convert } from "./Transformer.js";
import { TypeOnlyFixer } from "./TypeOnlyFixer.js";
import { parse, trimExtension, JSON_EXTENSIONS } from "../helpers.js";

/**
 * This is the *transform* part of `rollup-plugin-dts`.
 *
 * It sets a few input and output options, and otherwise is the core part of the
 * plugin responsible for bundling `.d.ts` files.
 *
 * That itself is a multi-step process:
 *
 * 1. The plugin has a preprocessing step that moves code around and cleans it
 *    up a bit, so that later steps can work with it easier. See `preprocess.ts`.
 * 2. It then converts the TypeScript AST into a ESTree-like AST that rollup
 *    understands. See `Transformer.ts`.
 * 3. After rollup is finished, the plugin will postprocess the output in a
 *    `renderChunk` hook. As rollup usually outputs javascript, it can output
 *    some code that is invalid in the context of a `.d.ts` file. In particular,
 *    the postprocess convert any javascript code that was created for namespace
 *    exports into TypeScript namespaces. See `NamespaceFixer.ts`.
 */
export const transform = () => {
  const allTypeReferences = new Map<string, Set<string>>();
  const allFileReferences = new Map<string, Set<string>>();

  return {
    name: "dts-transform",

    options({ onLog, ...options }) {
      return {
        ...options,
        onLog(level, log, defaultHandler) {
          if (level === "warn" && log.code === "CIRCULAR_DEPENDENCY") {
            return;
          }
          if (onLog) {
            onLog(level, log, defaultHandler);
          } else {
            defaultHandler(level, log);
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
        interop: "esModule",
        generatedCode: Object.assign({ symbols: false }, options.generatedCode),
        strict: false,
      };
    },

    transform(code, fileName) {
      // `fileName` may not match the name in the moduleIds,
      // as we generate the `fileName` manually in the previews step,
      // so we need to find the correct moduleId.
      const name = trimExtension(fileName)
      const moduleIds = this.getModuleIds()
      const moduleId = Array.from(moduleIds).find((id) => trimExtension(id) === name)
      const isEntry = Boolean(moduleId && this.getModuleInfo(moduleId)?.isEntry)
      const isJSON = Boolean(moduleId && JSON_EXTENSIONS.test(moduleId))

      let sourceFile = parse(fileName, code);
      const preprocessed = preProcess({ sourceFile, isEntry, isJSON });
      // `sourceFile.fileName` here uses forward slashes
      allTypeReferences.set(sourceFile.fileName, preprocessed.typeReferences);
      allFileReferences.set(sourceFile.fileName, preprocessed.fileReferences);

      code = preprocessed.code.toString();

      sourceFile = parse(fileName, code);
      const converted = convert({ sourceFile });

      if (process.env.DTS_DUMP_AST) {
        console.log(fileName);
        console.log(code);
        console.log(JSON.stringify(converted.ast.body, undefined, 2));
      }

      return { code, ast: converted.ast as any, map: preprocessed.code.generateMap() as any };
    },

    renderChunk(inputCode, chunk, options) {
      const source = parse(chunk.fileName, inputCode);
      const fixer = new NamespaceFixer(source);

      const typeReferences = new Set<string>();
      const fileReferences = new Set<string>();
      for (const fileName of Object.keys(chunk.modules)) {
        for (const ref of allTypeReferences.get(fileName.split("\\").join("/")) || []) {
          typeReferences.add(ref);
        }
        for (const ref of allFileReferences.get(fileName.split("\\").join("/")) || []) {
          if (ref.startsWith(".")) {
            // Need absolute path of the target file here
            const absolutePathToOriginal = path.join(path.dirname(fileName), ref);
            const chunkFolder =
              (options.file && path.dirname(options.file)) ||
              (chunk.facadeModuleId && path.dirname(chunk.facadeModuleId!)) ||
              ".";
            let targetRelPath = path.relative(chunkFolder, absolutePathToOriginal).split("\\").join("/");
            if (targetRelPath[0] !== ".") {
              targetRelPath = "./" + targetRelPath;
            }
            fileReferences.add(targetRelPath);
          } else {
            fileReferences.add(ref);
          }
        }
      }

      let code = writeBlock(Array.from(fileReferences, (ref) => `/// <reference path="${ref}" />`));
      code += writeBlock(Array.from(typeReferences, (ref) => `/// <reference types="${ref}" />`));
      code += fixer.fix();

      if (!code) {
        code += "\nexport { };";
      }

      const typeOnlyFixer = new TypeOnlyFixer(chunk.fileName, code, !!options.sourcemap);

      return typeOnlyFixer.fix();
    },
  } satisfies Plugin;
};

function writeBlock(codes: Array<string>): string {
  if (codes.length) {
    return codes.join("\n") + "\n";
  }
  return "";
}
