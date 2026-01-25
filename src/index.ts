import * as path from "node:path";
import type { PluginImpl, Plugin } from "rollup";
import ts from "typescript";
import { type Options, resolveDefaultOptions, type ResolvedOptions } from "./options.js";
import { createProgram, createPrograms, formatHost, getCompilerOptions } from "./program.js";
import { transform } from "./transform/index.js";
import { trimExtension, DTS_EXTENSIONS, JSON_EXTENSIONS, getDeclarationId } from "./helpers.js";

export type { Options };

const TS_EXTENSIONS = /\.([cm]ts|[tj]sx?)$/;

interface DtsPluginContext {
  /**
   * The entry points of the bundle.
   */
  entries: string[];
  /**
   * There exists one Program object per entry point, except when all entry points are ".d.ts" modules.
   */
  programs: ts.Program[];
  resolvedOptions: ResolvedOptions;
}

interface ResolvedModule {
  code: string;
  source?: ts.SourceFile;
  program?: ts.Program;
}

function getModule(
  { entries, programs, resolvedOptions }: DtsPluginContext,
  fileName: string,
  code: string,
): ResolvedModule | null {
  const { compilerOptions, tsconfig } = resolvedOptions;
  // Create any `ts.SourceFile` objects on-demand for ".d.ts" modules,
  // but only when there are zero ".ts" entry points.
  if (!programs.length && DTS_EXTENSIONS.test(fileName)) {
    return { code };
  }

  const isEntry = entries.includes(fileName);
  // Rollup doesn't tell you the entry point of each module in the bundle,
  // so we need to ask every TypeScript program for the given filename.
  const existingProgram = programs.find((p) => {
    // Entry points may be in the other entry source files, but it can't emit from them.
    // So we should find the program about the entry point which is the root files.
    if (isEntry) {
      return p.getRootFileNames().includes(fileName);
    } else {
      const sourceFile = p.getSourceFile(fileName);
      if (sourceFile && p.isSourceFileFromExternalLibrary(sourceFile)) {
        return false;
      }
      return !!sourceFile;
    }
  });
  if (existingProgram) {
    // we know this exists b/c of the .filter above, so this non-null assertion is safe
    const source = existingProgram.getSourceFile(fileName)!;
    return {
      code: source?.getFullText(),
      source,
      program: existingProgram,
    };
  } else if (ts.sys.fileExists(fileName)) {
    // For .d.ts files from external libraries (node_modules), return just the code without creating a program.
    // The programs.find() above returns false for external library files (line 52-54), causing
    // existingProgram to be undefined even though the file exists in a program. Without this check,
    // we would create a new program for each external .d.ts file, causing memory exhaustion
    // with large packages like type-fest (170+ files → 170+ programs → OOM).
    if (programs.length > 0 && DTS_EXTENSIONS.test(fileName)) {
      // Apply this optimization when bundling external packages via includeExternal or respectExternal
      const shouldBundleExternal = resolvedOptions.includeExternal.length > 0 || resolvedOptions.respectExternal;
      if (shouldBundleExternal) {
        return { code };
      }
    }
    const newProgram = createProgram(fileName, compilerOptions, tsconfig, resolvedOptions.sourcemap);
    programs.push(newProgram);
    // we created hte program from this fileName, so the source file must exist :P
    const source = newProgram.getSourceFile(fileName)!;
    return {
      code: source?.getFullText(),
      source,
      program: newProgram,
    };
  } else {
    // the file isn't part of an existing program and doesn't exist on disk
    return null;
  }
}

const plugin: PluginImpl<Options> = (options = {}) => {
  const ctx: DtsPluginContext = { entries: [], programs: [], resolvedOptions: resolveDefaultOptions(options) };
  const transformPlugin = transform(ctx.resolvedOptions.sourcemap);

  return {
    name: "dts",

    // pass outputOptions, renderChunk, and generateBundle hooks to the inner transform plugin
    outputOptions: transformPlugin.outputOptions,
    renderChunk: transformPlugin.renderChunk,
    generateBundle: transformPlugin.generateBundle,

    options(options) {
      let { input = [] } = options;
      if (!Array.isArray(input)) {
        input = typeof input === "string" ? [input] : Object.values(input);
      } else if (input.length > 1) {
        // when dealing with multiple unnamed inputs, transform the inputs into
        // an explicit object, which strips the file extension
        options.input = {};
        for (const filename of input) {
          let name = trimExtension(filename)
          if (path.isAbsolute(filename)) {
            name = path.basename(name);
          } else {
            name = path.normalize(name);
          }
          options.input[name] = filename;
        }
      }

      ctx.programs = createPrograms(
        Object.values(input),
        ctx.resolvedOptions.compilerOptions,
        ctx.resolvedOptions.tsconfig,
        ctx.resolvedOptions.sourcemap,
      );

      return transformPlugin.options.call(this, options);
    },

    transform(code, id) {
      if (!TS_EXTENSIONS.test(id) && !JSON_EXTENSIONS.test(id)) {
        return null;
      }

      const watchFiles = (module: ResolvedModule) => {
        if (module.program) {
          const sourceDirectory = path.dirname(id);
          const sourceFilesInProgram = module.program
            .getSourceFiles()
            .map((sourceFile) => sourceFile.fileName)
            .filter((fileName) => fileName.startsWith(sourceDirectory));
          sourceFilesInProgram.forEach(this.addWatchFile);
        }
      };

      const handleDtsFile = () => {
        const module = getModule(ctx, id, code);
        if (module) {
          watchFiles(module);
          return transformPlugin.transform.call(this, module.code, id);
        }
        return null;
      };

      const treatTsAsDts = () => {
        const declarationId = getDeclarationId(id);
        const module = getModule(ctx, declarationId, code);
        if (module) {
          watchFiles(module);
          return transformPlugin.transform.call(this, module.code, declarationId);
        }
        return null;
      };

      const generateDts = () => {
        const module = getModule(ctx, id, code);
        if (!module || !module.source || !module.program) return null;
        watchFiles(module);

        const declarationId = getDeclarationId(id);

        // Capture both .d.ts and .d.ts.map from TypeScript emit
        // Emit order: .d.ts.map first, .d.ts second (verified via experiments/ts-emit-test.ts)
        let declarationText: string | undefined;
        let declarationMapText: string | undefined;

        const { emitSkipped, diagnostics } = module.program.emit(
          module.source,
          (emitFileName, text) => {
            if (emitFileName.endsWith(".map")) {
              declarationMapText = text;
            } else {
              declarationText = text;
            }
          },
          undefined, // cancellationToken
          true, // emitOnlyDtsFiles
          undefined, // customTransformers
          // @ts-ignore This is a private API for workers, should be safe to use as TypeScript Playground has used it for a long time.
          true, // forceDtsEmit
        );
        if (emitSkipped) {
          const errors = diagnostics.filter((diag) => diag.category === ts.DiagnosticCategory.Error);
          if (errors.length) {
            console.error(ts.formatDiagnostics(errors, formatHost));
            this.error("Failed to compile. Check the logs above.");
          }
        }

        if (!declarationText) return null;

        // Strip //# sourceMappingURL comment from declaration text since we handle the map via inputMapText
        // Otherwise Rollup would double-process: once from the comment, once from our transform map
        // Note: TypeScript's emit only produces external maps (never inline), so this is safe.
        // If a custom transformer were to inject an inline map, it would also be stripped.
        const cleanDeclarationText = declarationText.replace(/\n?\/\/# sourceMappingURL=[^\n]+/, "");

        // Pass declaration map text to transform for sourcemap hydration
        return transformPlugin.transform.call(this, cleanDeclarationText, declarationId, declarationMapText);
      };

      // if it's a .d.ts file, handle it as-is
      if (DTS_EXTENSIONS.test(id)) return handleDtsFile();

      // if it's a json file, use the typescript compiler to generate the declarations,
      // requires `compilerOptions.resolveJsonModule: true`.
      // This is also commonly used with `@rollup/plugin-json` to import JSON files.
      if (JSON_EXTENSIONS.test(id)) return generateDts();

      // first attempt to treat .ts files as .d.ts files, and otherwise use the typescript compiler to generate the declarations
      return treatTsAsDts() ?? generateDts();
    },

    resolveId(source, importer) {
      if (!importer) {
        // store the entry point, because we need to know which program to add the file
        ctx.entries.push(path.resolve(source));
        return;
      }

      // normalize directory separators to forward slashes, as apparently typescript expects that?
      importer = importer.split("\\").join("/");

      let resolvedCompilerOptions = ctx.resolvedOptions.compilerOptions;
      if (ctx.resolvedOptions.tsconfig) {
        // Here we have a chicken and egg problem.
        // `source` would be resolved by `ts.nodeModuleNameResolver` a few lines below, but
        // `ts.nodeModuleNameResolver` requires `compilerOptions` which we have to resolve here,
        // since we have a custom `tsconfig.json`.
        // So, we use Node's resolver algorithm so we can see where the request is coming from so we
        // can load the custom `tsconfig.json` from the correct path.
        const resolvedSource = source.startsWith(".") ? path.resolve(path.dirname(importer), source) : source;
        resolvedCompilerOptions = getCompilerOptions(
          resolvedSource,
          ctx.resolvedOptions.compilerOptions,
          ctx.resolvedOptions.tsconfig,
          ctx.resolvedOptions.sourcemap,
        ).compilerOptions;
      }

      // resolve this via typescript
      const { resolvedModule } = ts.resolveModuleName(source, importer, resolvedCompilerOptions, ts.sys);
      if (!resolvedModule) {
        return;
      }

      if (resolvedModule.isExternalLibraryImport && resolvedModule.packageId && ctx.resolvedOptions.includeExternal.includes(resolvedModule.packageId.name)) {
        // include types from specified external modules
        return { id: path.resolve(resolvedModule.resolvedFileName) };
      }
      else if (!ctx.resolvedOptions.respectExternal && resolvedModule.isExternalLibraryImport) {
        // here, we define everything else that comes from `node_modules` as `external`.
        return { id: source, external: true };
      } else {
        // using `path.resolve` here converts paths back to the system specific separators
        return { id: path.resolve(resolvedModule.resolvedFileName) };
      }
    },
  } satisfies Plugin;
};

export { plugin as dts, plugin as default };
