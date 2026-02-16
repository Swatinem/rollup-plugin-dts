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
import { loadInputSourcemap, hydrateSourcemap, type InputSourceMap, type SourcemapInfo } from "./sourcemap.js";

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

export const transform = (enableSourcemap: boolean) => {
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

    transform(code, fileName, inputMapText?: string) {
      // `fileName` may not match the name in the moduleIds,
      // as we generate the `fileName` manually in the previews step,
      // so we need to find the correct moduleId.
      const name = trimExtension(fileName);
      const moduleIds = this.getModuleIds();
      const moduleId = Array.from(moduleIds).find((id) => trimExtension(id) === name);
      const isEntry = Boolean(moduleId && this.getModuleInfo(moduleId)?.isEntry);
      const isJSON = Boolean(moduleId && JSON_EXTENSIONS.test(moduleId));

      // Preserve original code for loadInputSourcemap() before preProcess strips sourceMappingURL
      const rawCode = code;

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

      if (!enableSourcemap) {
        return { code, ast: converted.ast as any };
      }

      // hires:true generates per-character mappings instead of per-line.
      // Without this, Go-to-Definition jumps to line starts instead of identifiers.
      const map = preprocessed.code.generateMap({ hires: true, source: fileName });

      // Store info for lazy sourcemap loading in generateBundle
      // For .d.ts files: will look for external .d.ts.map file
      // For .ts files compiled via generateDts(): inputMapText contains the in-memory map
      if (DTS_EXTENSIONS.test(fileName)) {
        pendingSourcemaps.set(fileName, {
          fileName,
          originalCode: rawCode,
          inputMapText,
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

      // Helper to detect URL paths (http://, https://, file://, etc.)
      // Requires :// to avoid matching Windows drive letters like C:\ or D:/
      const isUrl = (p: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(p);

      for (const { fileName, inputMap } of loadedMaps) {
        if (inputMap && inputMap.sources) {
          const inputMapDir = path.dirname(fileName);

          // Resolve sourceRoot: preserve URLs verbatim, resolve filesystem paths
          let sourceRoot: string;
          if (inputMap.sourceRoot) {
            sourceRoot = isUrl(inputMap.sourceRoot) ? inputMap.sourceRoot : path.resolve(inputMapDir, inputMap.sourceRoot);
          } else {
            sourceRoot = inputMapDir;
          }
          const sourceRootIsUrl = isUrl(sourceRoot);

          inputSourcemaps.set(fileName, {
            version: inputMap.version ?? 3,
            sources: inputMap.sources.map((source) => {
              if (source === null) return null;
              // URL sources pass through unchanged
              if (isUrl(source)) return source;
              // URL sourceRoot: use URL constructor for proper path resolution (handles ../ segments)
              if (sourceRootIsUrl) {
                const base = sourceRoot.endsWith("/") ? sourceRoot : sourceRoot + "/";
                return new URL(source, base).toString();
              }
              // Filesystem paths: use path.resolve
              return path.isAbsolute(source) ? source : path.resolve(sourceRoot, source);
            }),
            // Note: sourcesContent intentionally not copied.
            // TypeScript's declaration maps never include sourcesContent, and tsserver's
            // getDocumentPositionMapper() rejects maps that have it (returns identity mapper).
            // https://github.com/microsoft/TypeScript/blob/b19a9da2a3b8f2a720d314d01258dd2bdc110fef/src/services/sourcemaps.ts#L226
            mappings: inputMap.mappings,
            names: inputMap.names,
          });
        }
      }

      const outputDir = options.dir || (options.file ? path.dirname(options.file) : process.cwd());

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || !chunk.map) continue;

        // Check if any sources have input sourcemaps that need to be composed
        // Sources in chunk.map are relative to the chunk's output location, not the outputDir
        const chunkDir = path.join(outputDir, path.dirname(chunk.fileName));

        // Normalize path to relative forward-slash format for sourcemaps
        // Must be relative to chunkDir since sourcemap paths are relative to the .map file location
        // URL sources pass through unchanged (e.g., https://..., file://...)
        const toRelativeSourcePath = (source: string) => {
          if (isUrl(source)) return source;
          const relative = path.isAbsolute(source) ? path.relative(chunkDir, source) : source;
          return relative.replaceAll("\\", "/");
        };
        const toRelativeSourcePathOrNull = (source: string | null) =>
          source === null ? null : toRelativeSourcePath(source);

        const sourcesToRemap: Map<string, InputSourceMap> = new Map();
        for (const source of chunk.map.sources) {
          if (!source) continue;
          // Skip URL sources - they can't be remapped via filesystem lookup
          // and path.resolve would mangle them
          if (isUrl(source)) continue;
          const absoluteSource = path.resolve(chunkDir, source);
          let inputMap = inputSourcemaps.get(absoluteSource);

          // For .ts inputs compiled via generateDts(), the input map is stored under the .d.ts key
          // but Rollup's chunk.map.sources uses the original .ts module ID.
          // Match getDeclarationId() behavior: all source extensions (.ts, .mts, .tsx, etc.) → .d.ts
          if (!inputMap && /\.[cm]?[tj]sx?$/.test(absoluteSource) && !absoluteSource.endsWith(".d.ts")) {
            const dtsPath = absoluteSource.replace(/\.[cm]?[tj]sx?$/, ".d.ts");
            inputMap = inputSourcemaps.get(dtsPath);
          }

          if (inputMap) {
            sourcesToRemap.set(absoluteSource, inputMap);
          }
        }

        if (sourcesToRemap.size === 0) {
          // Always strip sourcesContent for TypeScript compatibility
          // (tsserver rejects maps with sourcesContent)
          delete (chunk.map as any).sourcesContent;

          // Handle empty chunks (like "export {};") - Rollup produces empty sources
          // but we want to preserve original source references from input map
          if (chunk.map.sources.length === 0 && chunk.facadeModuleId) {
            const inputMap = inputSourcemaps.get(chunk.facadeModuleId);
            if (inputMap && inputMap.sources.length > 0) {
              const newSources = inputMap.sources.map(toRelativeSourcePathOrNull);
              (chunk.map as any).sources = newSources;
            }
          }

          // Update the sourcemap asset (Rollup creates it separately from chunk.map)
          updateSourcemapAsset(bundle as any, chunk.fileName, {
            sources: chunk.map.sources.map(toRelativeSourcePathOrNull),
            mappings: chunk.map.mappings,
            names: chunk.map.names || [],
          });
          continue;
        }

        // For single-source cases where the input sourcemap also has a single source,
        // just replace the source directly to preserve the transform's hires mappings
        // This is important for Go-to-Definition to work line-by-line
        const isSingleSource = chunk.map.sources.length === 1 && sourcesToRemap.size === 1;
        const singleInputMap = isSingleSource ? Array.from(sourcesToRemap.values())[0] : null;
        const canSimplyReplace = singleInputMap && singleInputMap.sources.length === 1;

        let newSources: Array<string | null>;
        let newMappings: string;
        let newNames: string[];

        if (canSimplyReplace && singleInputMap) {
          // Sparse-Anchor Hydration: Rollup's output map is sparse (few segments per line)
          // because the plugin uses a virtual AST that doesn't preserve token positions.
          // Standard remapping via @jridgewell/remapping can only trace existing segments,
          // not add new ones - so we'd lose the per-identifier mappings from the input map.
          // Instead, we use Rollup's sparse segments as "anchors" to determine which source
          // line each output line came from, then copy all detailed segments from that line.
          newSources = singleInputMap.sources.map(toRelativeSourcePathOrNull);
          newMappings = hydrateSourcemap(chunk.map.mappings, singleInputMap, chunk.code);
          newNames = singleInputMap.names || [];
        } else {
          // Track visited files to prevent infinite recursion.
          // When TypeScript compiles foo.ts → foo.d.ts + foo.d.ts.map, the map's sources
          // point back to foo.ts. If we return the same map when resolving foo.ts,
          // @jridgewell/remapping will recursively try to resolve foo.ts again → infinite loop.
          const visitedFiles = new Set<string>();
          const remapped = remapping(chunk.map as unknown as RawSourceMap, (file) => {
            // File paths from remapping are relative to the chunk's output location
            const absolutePath = path.resolve(chunkDir, file);

            // Prevent infinite recursion: if we've already returned a map for this file,
            // return null to stop the chain (this file is the original source)
            if (visitedFiles.has(absolutePath)) {
              return null;
            }
            visitedFiles.add(absolutePath);

            const inputMap = sourcesToRemap.get(absolutePath);
            if (inputMap) {
              return inputMap as unknown as RawSourceMap;
            }
            return null;
          });

          newSources = remapped.sources.map(toRelativeSourcePathOrNull);
          newMappings = typeof remapped.mappings === "string" ? remapped.mappings : "";
          newNames = remapped.names || [];
        }

        (chunk.map as any).sources = newSources;
        delete (chunk.map as any).sourcesContent;
        chunk.map.mappings = newMappings;
        chunk.map.names = newNames;

        updateSourcemapAsset(bundle as any, chunk.fileName, {
          sources: newSources,
          mappings: newMappings,
          names: newNames,
        });
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

type SourcemapData = {
  sources: Array<string | null>;
  // sourcesContent intentionally omitted for TypeScript compatibility.
  // tsserver rejects maps with sourcesContent, falling back to identity mapper (no mapping).
  // https://github.com/microsoft/TypeScript/blob/b19a9da2a3b8f2a720d314d01258dd2bdc110fef/src/services/sourcemaps.ts#L226
  mappings: string;
  names: string[];
};

function updateSourcemapAsset(
  bundle: Record<string, { type: string; source?: string }>,
  chunkFileName: string,
  data: SourcemapData,
) {
  const mapFileName = `${chunkFileName}.map`;
  const mapAsset = bundle[mapFileName];
  if (mapAsset && mapAsset.type === "asset") {
    mapAsset.source = JSON.stringify({
      version: 3,
      // file should be just the basename since the .map is in the same directory
      file: path.basename(chunkFileName),
      ...data,
    });
  }
}
