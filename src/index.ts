import * as path from "path";
import { PluginImpl } from "rollup";
import ts from "typescript";
import { createProgram, createPrograms, dts, formatHost } from "./program.js";
import { transform } from "./transform/index.js";

const tsx = /\.(t|j)sx?$/;

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
}

const plugin: PluginImpl<Options> = (options = {}) => {
  const transformPlugin = transform(options);

  const { respectExternal = false, compilerOptions = {} } = options;
  // There exists one Program object per entry point,
  // except when all entry points are ".d.ts" modules.
  let programs: Array<ts.Program> = [];

  type ResolvedSourceFile = ts.SourceFile | undefined | true;
  function getModule(fileName: string) {
    let source: ResolvedSourceFile;
    let program: ts.Program | undefined;
    // Create any `ts.SourceFile` objects on-demand for ".d.ts" modules,
    // but only when there are zero ".ts" entry points.
    if (!programs.length && fileName.endsWith(dts)) {
      source = true;
    } else {
      // Rollup doesn't tell you the entry point of each module in the bundle,
      // so we need to ask every TypeScript program for the given filename.
      program = programs.find((p) => (source = p.getSourceFile(fileName)));
      if (!program && ts.sys.fileExists(fileName)) {
        programs.push((program = createProgram(fileName, compilerOptions)));
        source = program.getSourceFile(fileName);
      }
    }
    return { source, program };
  }

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

      programs = createPrograms(Object.values(input), compilerOptions);

      return (transformPlugin.options as any).call(this, options);
    },

    outputOptions: transformPlugin.outputOptions,

    transform(code, id) {
      const transformFile = (source: ResolvedSourceFile, id: string) => {
        if (typeof source === "object") {
          code = source.getFullText();
        }
        return (transformPlugin.transform as any).call(this, code, id);
      };
      if (!tsx.test(id)) {
        return null;
      }
      if (id.endsWith(dts)) {
        const { source } = getModule(id);
        return source ? transformFile(source, id) : null;
      }

      // Always try ".d.ts" before ".tsx?"
      const declarationId = id.replace(tsx, dts);
      let module = getModule(declarationId);
      if (module.source) {
        return transformFile(module.source, declarationId);
      }
      // Generate in-memory ".d.ts" modules from ".tsx?" modules!
      module = getModule(id);
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

      // resolve this via typescript
      const { resolvedModule } = ts.nodeModuleNameResolver(source, importer, compilerOptions, ts.sys);
      if (!resolvedModule) {
        return;
      }

      if (!respectExternal && resolvedModule.isExternalLibraryImport) {
        // here, we define everything that comes from `node_modules` as `external`.
        return { id: source, external: true };
      } else {
        // using `path.resolve` here converts paths back to the system specific separators
        return { id: path.resolve(resolvedModule.resolvedFileName) };
      }
    },

    renderChunk: transformPlugin.renderChunk,
  };
};

export default plugin;
