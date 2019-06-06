import * as ts from "typescript";
import * as path from "path";
import { PluginImpl, SourceDescription, InputOptions } from "rollup";
import { Transformer } from "./Transformer";
import { NamespaceFixer } from "./NamespaceFixer";

const dts = ".d.ts";
const tsx = /\.tsx?$/;

const formatHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  getNewLine: () => ts.sys.newLine,
  getCanonicalFileName: ts.sys.useCaseSensitiveFileNames ? f => f : f => f.toLowerCase(),
};

const getCompilerOptions = (input: string): ts.CompilerOptions => {
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
};

const createProgram = ({ input }: InputOptions) => {
  if (typeof input !== "string") {
    throw new TypeError('"input" option must be a string');
  }
  input = path.resolve(input);
  const compilerOptions: ts.CompilerOptions = {
    ...getCompilerOptions(input),
    // Ensure ".d.ts" modules are generated
    declaration: true,
    // Skip ".js" generation
    emitDeclarationOnly: true,
    // Skip code generation when error occurs
    noEmitOnError: true,
    // Avoid extra work
    checkJs: false,
    sourceMap: false,
    skipLibCheck: true,
    // Ensure TS2742 errors are visible
    preserveSymlinks: true,
  };
  const host = ts.createCompilerHost(compilerOptions, true);
  return ts.createProgram([input], compilerOptions, host);
};

// Parse a TypeScript module into an ESTree program.
const transformFile = (input: ts.SourceFile): SourceDescription => {
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
  let program: ts.Program;
  return {
    name: "dts",

    options(options) {
      program = createProgram(options);
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
      const source = program.getSourceFile(id);
      if (!source) {
        return null;
      }
      if (id.endsWith(dts)) {
        return transformFile(source);
      }
      const ambientId = id.replace(tsx, dts);
      const ambientDefs = program.getSourceFile(ambientId);
      if (ambientDefs) {
        return transformFile(ambientDefs);
      }
      // Transform ".ts" modules into ".d.ts" in-memory!
      let generated!: SourceDescription;
      const { emitSkipped, diagnostics } = program.emit(
        source,
        (_, code) => {
          const ambientDefs = ts.createSourceFile(ambientId, code, ts.ScriptTarget.Latest, true);
          generated = transformFile(ambientDefs);
        },
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
