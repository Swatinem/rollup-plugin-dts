import path from "path";
import { PluginImpl, SourceDescription } from "rollup";
import ts from "typescript";

import { NamespaceFixer } from "./NamespaceFixer";
import { preProcess } from "./preprocess";
import { createProgram, createPrograms, dts, formatHost } from "./program";
import { Transformer } from "./Transformer";

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
  const { respectExternal = false, compilerOptions = {} } = options;
  // There exists one Program object per entry point,
  // except when all entry points are ".d.ts" modules.
  let programs: Array<ts.Program> = [];

  function getModule(fileName: string, code: string) {
    let source: ts.SourceFile | undefined;
    let program: ts.Program | undefined;
    // Create any `ts.SourceFile` objects on-demand for ".d.ts" modules,
    // but only when there are zero ".ts" entry points.
    if (!programs.length && fileName.endsWith(dts)) {
      source = ts.createSourceFile(
        fileName,
        code,
        ts.ScriptTarget.Latest,
        true, // setParentNodes
      );
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

  // Parse a TypeScript module into an ESTree program.
  const allTypeReferences = new Map<string, Set<string>>();

  function transformFile(input: ts.SourceFile): SourceDescription {
    const preprocessed = preProcess({ sourceFile: input });
    const code = preprocessed.code.toString();
    input = ts.createSourceFile(input.fileName, code, ts.ScriptTarget.Latest, true);

    const transformer = new Transformer(input);
    const output = transformer.transform();

    allTypeReferences.set(input.fileName, preprocessed.typeReferences);

    if (process.env.DTS_DUMP_AST) {
      console.log(input.fileName);
      console.log(code);
      console.log(JSON.stringify(output.ast.body, undefined, 2));
    }

    return { code, ast: output.ast as any };
  }

  return {
    name: "dts",

    options(options) {
      let { input = [], onwarn } = options;
      if (!Array.isArray(input)) {
        input = typeof input === "string" ? [input] : Object.values(input);
      } else if (input.length > 1) {
        // when dealing with multiple unnamed inputs, transform the inputs into
        // an explicit object, which strips the file extension
        options.input = {};
        for (const filename of input) {
          const name = path.basename(filename).replace(/((\.d)?\.(t|j)sx?)$/, "");
          options.input[name] = filename;
        }
      }

      programs = createPrograms(Object.values(input), compilerOptions);

      return {
        ...options,
        onwarn(warning, warn) {
          if (warning.code != "CIRCULAR_DEPENDENCY") {
            if (onwarn) onwarn(warning, warn)
            else warn(warning)
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
        chunkFileNames: options.chunkFileNames || "[name]-[hash]" + dts,
        entryFileNames: options.entryFileNames || "[name]" + dts,
        format: "es",
        exports: "named",
        compact: false,
        freeze: true,
        interop: false,
        namespaceToStringTag: false,
        strict: false,
      };
    },

    transform(code, id) {
      if (!tsx.test(id)) {
        return null;
      }
      if (id.endsWith(dts)) {
        const { source } = getModule(id, code);
        return source ? transformFile(source) : null;
      }

      // Always try ".d.ts" before ".tsx?"
      const declarationId = id.replace(tsx, dts);
      let module = getModule(declarationId, code);
      if (module.source) {
        return transformFile(module.source);
      }
      // Generate in-memory ".d.ts" modules from ".tsx?" modules!
      module = getModule(id, code);
      if (!module.source || !module.program) {
        return null;
      }
      let generated!: SourceDescription;
      const { emitSkipped, diagnostics } = module.program.emit(
        module.source,
        (_, declarationText) => {
          const source = ts.createSourceFile(
            declarationId,
            declarationText,
            ts.ScriptTarget.Latest,
            true, // setParentNodes
          );
          generated = transformFile(source);
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

    renderChunk(code, chunk) {
      const source = ts.createSourceFile(chunk.fileName, code, ts.ScriptTarget.Latest, true);
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

export default plugin;
