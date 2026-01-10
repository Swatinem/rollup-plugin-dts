import * as path from "node:path";
import type { Plugin, SourceMap } from "rollup";
import remapping from "@jridgewell/remapping";
import type { RawSourceMap } from "@jridgewell/remapping";
import { NamespaceFixer } from "./NamespaceFixer.js";
import { preProcess } from "./preprocess.js";
import { convert } from "./Transformer.js";
import { TypeOnlyFixer } from "./TypeOnlyFixer.js";
import { parse, trimExtension, JSON_EXTENSIONS, DTS_EXTENSIONS } from "../helpers.js";
import { RelativeModuleDeclarationFixer } from "./ModuleDeclarationFixer.js";
import MagicString from "magic-string";
import { loadInputSourcemap, type InputSourceMap, type SourcemapInfo } from "./sourcemap.js";

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
  // Track pending sourcemaps to load lazily in generateBundle
  const pendingSourcemaps = new Map<string, SourcemapInfo>();

  return {
    name: "dts-transform",

    buildStart() {
      // Clear state for watch mode rebuilds
      allTypeReferences.clear();
      allFileReferences.clear();
      pendingSourcemaps.clear();
    },

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
      const name = trimExtension(fileName);
      const moduleIds = this.getModuleIds();
      const moduleId = Array.from(moduleIds).find((id) => trimExtension(id) === name);
      const isEntry = Boolean(moduleId && this.getModuleInfo(moduleId)?.isEntry);
      const isJSON = Boolean(moduleId && JSON_EXTENSIONS.test(moduleId));

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

      // Generate high-resolution sourcemap for line-by-line mappings (required for Go-to-Definition)
      const map = preprocessed.code.generateMap({ hires: true, source: fileName });

      // Store info for lazy sourcemap loading in generateBundle (avoids file I/O if sourcemaps disabled)
      if (DTS_EXTENSIONS.test(fileName)) {
        const sourceMapCommentRegex = /\/\/[#@]\s*sourceMappingURL\s*=\s*(\S+)\s*$/m;
        const match = sourceMapCommentRegex.exec(code);
        pendingSourcemaps.set(fileName, {
          fileName,
          sourceMappingUrl: match ? match[1]! : null,
        });
      }

      return { code, ast: converted.ast as any, map: map as unknown as SourceMap };
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

      const typeOnlyFixer = new TypeOnlyFixer(chunk.fileName, code);

      const typesFixed = typeOnlyFixer.fix();

      const relativeModuleDeclarationFixed = new RelativeModuleDeclarationFixer(
        chunk.fileName,
        "magicCode" in typesFixed && typesFixed.magicCode ? typesFixed.magicCode : new MagicString(code),
        !!options.sourcemap,
        "./" + path.basename(chunk.fileName, ".d.ts"),
      );

      return relativeModuleDeclarationFixed.fix();
    },

    async generateBundle(options, bundle) {
      // Fix sourcemap sources to point to original .ts files
      // When input .d.ts files have associated .d.ts.map files pointing to original .ts sources,
      // we use sourcemap remapping to compose the transform's map with the input map
      if (!options.sourcemap) return;

      // Lazily load input sourcemaps in parallel now that we know sourcemaps are enabled
      const inputSourcemaps = new Map<string, InputSourceMap>();
      const entries = Array.from(pendingSourcemaps.entries());
      const loadedMaps = await Promise.all(
        entries.map(async ([fileName, info]) => ({
          fileName,
          inputMap: await loadInputSourcemap(info),
        })),
      );

      for (const { fileName, inputMap } of loadedMaps) {
        if (inputMap && inputMap.sources) {
          const inputMapDir = path.dirname(fileName);
          inputSourcemaps.set(fileName, {
            version: inputMap.version || 3,
            sources: inputMap.sources.map((source: string) =>
              path.isAbsolute(source) ? source : path.resolve(inputMapDir, source),
            ),
            sourcesContent: inputMap.sourcesContent,
            mappings: inputMap.mappings,
            names: inputMap.names,
          });
        }
      }

      const outputDir = options.dir || (options.file ? path.dirname(options.file) : process.cwd());

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.map) continue;

        // Check if any sources have input sourcemaps that need to be composed
        const sourcesToRemap: Map<string, InputSourceMap> = new Map();
        for (const source of chunk.map.sources) {
          if (!source) continue;
          const absoluteSource = path.resolve(outputDir, source);
          const inputMap = inputSourcemaps.get(absoluteSource);
          if (inputMap) {
            sourcesToRemap.set(absoluteSource, inputMap);
          }
        }

        if (sourcesToRemap.size === 0) continue;

        // For single-source cases where the input sourcemap also has a single source,
        // just replace the source directly to preserve the transform's hires mappings
        // This is important for Go-to-Definition to work line-by-line
        const isSingleSource = chunk.map.sources.length === 1 && sourcesToRemap.size === 1;
        const singleInputMap = isSingleSource ? Array.from(sourcesToRemap.values())[0] : null;
        const canSimplyReplace = singleInputMap && singleInputMap.sources.length === 1;

        let newSources: string[];
        let newSourcesContent: (string | null)[];
        let newMappings: string;
        let newNames: string[];

        if (canSimplyReplace && singleInputMap) {
          // Simple replacement: keep transform's mappings, just swap the source
          newSources = singleInputMap.sources.map((source) => {
            const relative = path.isAbsolute(source) ? path.relative(outputDir, source) : source;
            // Normalize to forward slashes for sourcemaps (URLs)
            return relative.replaceAll("\\", "/");
          });
          newSourcesContent = singleInputMap.sourcesContent || [null];
          newMappings = chunk.map.mappings;
          newNames = chunk.map.names || [];
        } else {
          // Multi-source case: use remapping to compose the sourcemaps
          const remapped = remapping(chunk.map as unknown as RawSourceMap, (file) => {
            const absolutePath = path.resolve(outputDir, file);
            const inputMap = sourcesToRemap.get(absolutePath);
            if (inputMap) {
              return inputMap as unknown as RawSourceMap;
            }
            return null;
          });

          newSources = remapped.sources
            .map((source) => {
              if (!source) return source as string;
              const relative = path.isAbsolute(source) ? path.relative(outputDir, source) : source;
              // Normalize to forward slashes for sourcemaps (URLs)
              return relative.replaceAll("\\", "/");
            })
            .filter((s): s is string => s !== null);
          newSourcesContent = (remapped.sourcesContent || []) as (string | null)[];
          newMappings = typeof remapped.mappings === "string" ? remapped.mappings : "";
          newNames = remapped.names || [];
        }

        // Update chunk.map
        chunk.map.sources = newSources;
        (chunk.map as any).sourcesContent = newSourcesContent;
        chunk.map.mappings = newMappings;
        chunk.map.names = newNames;

        // Also update the sourcemap asset
        const mapFileName = `${chunk.fileName}.map`;
        const mapAsset = bundle[mapFileName];
        if (mapAsset && mapAsset.type === "asset") {
          mapAsset.source = JSON.stringify({
            version: 3,
            file: chunk.fileName,
            sources: newSources,
            sourcesContent: newSourcesContent,
            mappings: newMappings,
            names: newNames,
          });
        }
      }
    },
  } satisfies Plugin;
};

function writeBlock(codes: Array<string>): string {
  if (codes.length) {
    return codes.join("\n") + "\n";
  }
  return "";
}
