import * as path from "path";
import { Plugin } from "rollup";
import ts from "typescript";
import { Options, resolveDefaultOptions, ResolvedOptions } from "./options.js";
import { createProgram, createPrograms, dts, formatHost, getCompilerOptions } from "./program.js";
import { transform } from "./transform/index.js";

export type { Options };

const TS_EXTENSIONS = /\.([cm]ts|[tj]sx?)$/;

interface DtsPluginContext {
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
  { programs, resolvedOptions: { compilerOptions, tsconfig } }: DtsPluginContext,
  fileName: string,
  code: string,
): ResolvedModule | null {
  // Create any `ts.SourceFile` objects on-demand for ".d.ts" modules,
  // but only when there are zero ".ts" entry points.
  if (!programs.length && fileName.endsWith(dts)) {
    return { code };
  }

  // Rollup doesn't tell you the entry point of each module in the bundle,
  // so we need to ask every TypeScript program for the given filename.
  const existingProgram = programs.find((p) => !!p.getSourceFile(fileName));
  if (existingProgram) {
    // we know this exists b/c of the .filter above, so this non-null assertion is safe
    const source = existingProgram.getSourceFile(fileName)!;
    return {
      code: source.getFullText(),
      source,
      program: existingProgram,
    };
  } else if (ts.sys.fileExists(fileName)) {
    const newProgram = createProgram(fileName, compilerOptions, tsconfig);
    programs.push(newProgram);
    // we created hte program from this fileName, so the source file must exist :P
    const source = newProgram.getSourceFile(fileName)!;
    return {
      code: source.getFullText(),
      source,
      program: newProgram,
    };
  } else {
    // the file isn't part of an existing program and doesn't exist on disk
    return null;
  }
}

export default function rollupPluginDts(options: Options = {}) {
  const transformPlugin = transform();
  const ctx: DtsPluginContext = { programs: [], resolvedOptions: resolveDefaultOptions(options) };

  return {
    name: "dts",

    // pass outputOptions & renderChunk hooks to the inner transform plugin
    outputOptions: transformPlugin.outputOptions,
    renderChunk: transformPlugin.renderChunk,

    options(options) {
      let { input = [] } = options;
      if (!Array.isArray(input)) {
        input = typeof input === "string" ? [input] : Object.values(input);
      } else if (input.length > 1) {
        // when dealing with multiple unnamed inputs, transform the inputs into
        // an explicit object, which strips the file extension
        options.input = {};
        for (const filename of input) {
          let name = filename.replace(/((\.d)?\.(t|j)sx?)$/, "");
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
      );

      return transformPlugin.options.call(this, options);
    },

    transform(code, id) {
      if (!TS_EXTENSIONS.test(id)) {
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
        const declarationId = id.replace(TS_EXTENSIONS, dts);
        let module = getModule(ctx, declarationId, code);
        if (module) {
          watchFiles(module);
          return transformPlugin.transform.call(this, module.code, declarationId);
        }
        return null;
      };

      const generateDtsFromTs = () => {
        const module = getModule(ctx, id, code);
        if (!module || !module.source || !module.program) return null;
        watchFiles(module);

        const declarationId = id.replace(TS_EXTENSIONS, dts);

        let generated!: ReturnType<typeof transformPlugin.transform>;
        const { emitSkipped, diagnostics } = module.program.emit(
          module.source,
          (_, declarationText) => {
            generated = transformPlugin.transform.call(this, declarationText, declarationId);
          },
          undefined, // cancellationToken
          true, // emitOnlyDtsFiles
        );
        if (emitSkipped) {
          const errors = diagnostics.filter((diag) => diag.category === ts.DiagnosticCategory.Error);
          if (errors.length) {
            console.error(ts.formatDiagnostics(errors, formatHost));
            this.error("Failed to compile. Check the logs above.");
          }
        }
        return generated;
      };

      // if it's a .d.ts file, handle it as-is
      if (id.endsWith(dts)) return handleDtsFile();

      // first attempt to treat .ts files as .d.ts files, and otherwise use the typescript compiler to generate the declarations
      return treatTsAsDts() ?? generateDtsFromTs();
    },

    resolveId(source, importer) {
      if (!importer) {
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
        ).compilerOptions;
      }

      // resolve this via typescript
      const { resolvedModule } = ts.nodeModuleNameResolver(source, importer, resolvedCompilerOptions, ts.sys);
      if (!resolvedModule) {
        return;
      }

      if (!ctx.resolvedOptions.respectExternal && resolvedModule.isExternalLibraryImport) {
        // here, we define everything that comes from `node_modules` as `external`.
        return { id: source, external: true };
      } else {
        // using `path.resolve` here converts paths back to the system specific separators
        return { id: path.resolve(resolvedModule.resolvedFileName) };
      }
    },
  } satisfies Plugin;
}
