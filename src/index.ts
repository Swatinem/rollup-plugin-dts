import * as path from "path";
import { Plugin } from "rollup";
import ts from "typescript";
import { createProgram, createPrograms, dts, formatHost, getCompilerOptions } from "./program.js";
import { transform } from "./transform/index.js";

const tsExtensions = /\.([cm]ts|[tj]sx?)$/;

export interface Options {
  /**
   * The plugin will by default flag *all* external libraries as `external`,
   * and thus prevent them from be bundled.
   * If you set the `respectExternal` option to `true`, the plugin will not do
   * any default classification, but rather use the `external` option as
   * configured via rollup.
   */
  respectExternal?: boolean;
  /**
   * In case you want to use TypeScript path-mapping feature, using the
   * `baseUrl` and `paths` properties, you can pass in `compilerOptions`.
   */
  compilerOptions?: ts.CompilerOptions;
  /**
   * Path to tsconfig.json, by default, will try to load 'tsconfig.json'
   */
  tsconfig?: string;
}

function resolveDefaultOptions(options: Options) {
  return {
    ...options,
    compilerOptions: options.compilerOptions ?? {},
    respectExternal: options.respectExternal ?? false,
  };
}

type ResolvedOptions = ReturnType<typeof resolveDefaultOptions>;

const transformPlugin = transform();

interface PluginContext {
  programs: ts.Program[];
  resolvedOptions: ResolvedOptions;
}

type ResolvedSourceFile = ts.SourceFile | undefined | true;

function getModule(
  { programs, resolvedOptions: { compilerOptions, tsconfig } }: PluginContext,
  fileName: string,
): { source: ResolvedSourceFile; program: ts.Program | undefined } {
  // Create any `ts.SourceFile` objects on-demand for ".d.ts" modules,
  // but only when there are zero ".ts" entry points.
  if (!programs.length && fileName.endsWith(dts)) {
    return { source: true, program: undefined };
  }

  // Rollup doesn't tell you the entry point of each module in the bundle,
  // so we need to ask every TypeScript program for the given filename.
  const existingProgram = programs.find((p) => !!p.getSourceFile(fileName));
  if (existingProgram) {
    return { source: existingProgram.getSourceFile(fileName), program: existingProgram };
  } else if (ts.sys.fileExists(fileName)) {
    const newProgram = createProgram(fileName, compilerOptions, tsconfig);
    programs.push(newProgram);
    return { source: newProgram.getSourceFile(fileName), program: newProgram };
  } else {
    return { source: undefined, program: undefined };
  }
}

export default (options: Options = {}) => {
  // There exists one Program object per entry point,
  // except when all entry points are ".d.ts" modules.
  const ctx: PluginContext = { programs: [], resolvedOptions: resolveDefaultOptions(options) };

  return {
    name: "dts",

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

    outputOptions: transformPlugin.outputOptions,

    transform(code, id) {
      const transformFile = (source: ResolvedSourceFile, id: string) => {
        if (typeof source === "object") {
          code = source.getFullText();
        }
        return transformPlugin.transform.call(this, code, id);
      };
      if (!tsExtensions.test(id)) {
        return null;
      }
      if (id.endsWith(dts)) {
        const { source } = getModule(ctx, id);
        return source ? transformFile(source, id) : null;
      }

      // Always try ".d.ts" before ".tsx?"
      const declarationId = id.replace(tsExtensions, dts);
      let module = getModule(ctx, declarationId);
      if (module.source) {
        return transformFile(module.source, declarationId);
      }
      // Generate in-memory ".d.ts" modules from ".tsx?" modules!
      module = getModule(ctx, id);
      if (typeof module.source != "object" || !module.program) {
        return null;
      }
      let generated!: ReturnType<typeof transformFile>;
      const { emitSkipped, diagnostics } = module.program.emit(
        module.source,
        (_, declarationText) => {
          code = declarationText;
          generated = transformFile(true, declarationId);
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

    renderChunk: transformPlugin.renderChunk,
  } satisfies Plugin;
};
