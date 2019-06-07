import * as path from "path";
import { PluginImpl, SourceDescription } from "rollup";
import * as ts from "typescript";
import { NamespaceFixer } from "./NamespaceFixer";
import { Transformer } from "./Transformer";

const dts = ".d.ts";
const tsx = /\.tsx?$/;

const formatHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  getNewLine: () => ts.sys.newLine,
  getCanonicalFileName: ts.sys.useCaseSensitiveFileNames ? f => f : f => f.toLowerCase(),
};

function getCompilerOptions(input: string): ts.CompilerOptions {
  const configPath = ts.findConfigFile(path.dirname(input), ts.sys.fileExists);
  if (!configPath) {
    return {};
  }
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    console.error(ts.formatDiagnostic(error, formatHost));
    return {};
  }
  const { options, errors } = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
  if (errors.length) {
    console.error(ts.formatDiagnostics(errors, formatHost));
    return {};
  }
  return options;
}

function createProgram(main: string) {
  main = path.resolve(main);
  const compilerOptions: ts.CompilerOptions = {
    ...getCompilerOptions(main),
    // Ensure ".d.ts" modules are generated
    declaration: true,
    // Skip ".js" generation
    emitDeclarationOnly: true,
    // Skip code generation when error occurs
    noEmitOnError: true,
    // Avoid extra work
    checkJs: false,
    declarationMap: false,
    skipLibCheck: true,
    // Ensure TS2742 errors are visible
    preserveSymlinks: true,
  };
  const host = ts.createCompilerHost(compilerOptions, true);
  return ts.createProgram([main], compilerOptions, host);
};

// Parse a TypeScript module into an ESTree program.
function transformFile(input: ts.SourceFile): SourceDescription {
  const transformer = new Transformer(input);
  const { ast, fixups } = transformer.transform();

  // NOTE(swatinem):
  // hm, typescript generates `export default` without a declare,
  // but rollup moves the `export default` to a different place, which leaves
  // the function declaration without a `declare`.
  // Well luckily both words have the same length, haha :-D
  let code = input.getText();
  code = code.replace(/(export\s+)default(\s+(function|class))/m, "$1declare$2");
  for (const fixup of fixups) {
    code = code.slice(0, fixup.range.start) + fixup.identifier + code.slice(fixup.range.end);
  }

  return { code, ast };
};

const plugin: PluginImpl<{}> = () => {
  // There exists one Program object per entry point,
  // except when all entry points are ".d.ts" modules.
  const programs = new Map<string, ts.Program>();
  function getModule(fileName: string) {
    let source: ts.SourceFile | undefined;
    let program: ts.Program | undefined;
    if (programs.size) {
      // Rollup doesn't tell you the entry point of each module in the bundle,
      // so we need to ask every TypeScript program for the given filename.
      for (program of programs.values()) {
        source = program.getSourceFile(fileName);
        if (source) break;
      }
    }
    // Create any `ts.SourceFile` objects on-demand for ".d.ts" modules,
    // but only when there are zero ".ts" entry points.
    else if (fileName.endsWith(dts)) {
      const code = ts.sys.readFile(fileName, "utf8");
      if (code)
        source = ts.createSourceFile(
          fileName,
          code,
          ts.ScriptTarget.Latest,
          true, // setParentNodes
        );
    }
    return { source, program };
  };

  return {
    name: "dts",

    options(options) {
      let { input } = options;
      if (!Array.isArray(input)) {
        input = !input ? [] : typeof input === "string" ? [input] : Object.values(input);
      }
      if (!input.every(main => main.endsWith(dts))) {
        input.forEach(main => programs.set(main, createProgram(main)));
      }
      return {
        ...options,
        treeshake: {
          moduleSideEffects: "no-external",
          propertyReadSideEffects: true,
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

    load(id) {
      if (!tsx.test(id)) {
        return null;
      }
      if (id.endsWith(dts)) {
        const { source } = getModule(id);
        return source ? transformFile(source) : null;
      }
      // Always try ".d.ts" before ".tsx?"
      const declarationId = id.replace(tsx, dts);
      let module = getModule(declarationId);
      if (module.source) {
        return transformFile(module.source);
      }
      // Generate in-memory ".d.ts" modules from ".tsx?" modules!
      module = getModule(id);
      if (!module.source || !module.program) {
        return null;
      }
      let generated!: SourceDescription;
      const { emitSkipped, diagnostics } = module.program.emit(
        module.source,
        (_, declarationText) =>
          (generated = transformFile(
            ts.createSourceFile(
              declarationId,
              declarationText,
              ts.ScriptTarget.Latest,
              true, // setParentNodes
            ),
          )),
        undefined, // cancellationToken
        true, // emitOnlyDtsFiles
      );
      if (emitSkipped) {
        const errors = diagnostics.filter(diag => diag.category === ts.DiagnosticCategory.Error);
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

      // resolve this via typescript
      const { resolvedModule } = ts.nodeModuleNameResolver(source, importer, {}, ts.sys);
      if (!resolvedModule) {
        return;
      }

      // here, we define everything that comes from `node_modules` as `external`.
      // maybe its a good idea to introduce an option for this?
      return resolvedModule.isExternalLibraryImport
        ? { id: source, external: true }
        : { id: resolvedModule.resolvedFileName };
    },

    renderChunk(code, chunk) {
      const source = ts.createSourceFile(chunk.fileName, code, ts.ScriptTarget.Latest, true);
      const fixer = new NamespaceFixer(source);
      code = fixer.fix();
      return { code, map: { mappings: "" } };
    },
  };
};

export default plugin;
