import path from "path";
import { PluginImpl, SourceDescription } from "rollup";
import * as ts from "typescript";
import { NamespaceFixer } from "./NamespaceFixer";
import { createPrograms, dts, formatHost } from "./program";
import { Transformer } from "./Transformer";

const tsx = /\.tsx?$/;

const plugin: PluginImpl<{}> = () => {
  // There exists one Program object per entry point,
  // except when all entry points are ".d.ts" modules.
  let programs: Array<ts.Program> = [];

  function getModule(fileName: string) {
    let source: ts.SourceFile | undefined;
    let program: ts.Program | undefined;
    if (programs.length) {
      // Rollup doesn't tell you the entry point of each module in the bundle,
      // so we need to ask every TypeScript program for the given filename.
      for (program of programs) {
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
  }

  // Parse a TypeScript module into an ESTree program.
  const typeReferences = new Set<string>();
  function transformFile(input: ts.SourceFile): SourceDescription {
    for (const ref of input.typeReferenceDirectives) {
      typeReferences.add(ref.fileName);
    }

    const transformer = new Transformer(input);
    const { ast, fixups } = transformer.transform();

    // NOTE(swatinem):
    // hm, typescript generates `export default` without a declare,
    // but rollup moves the `export default` to a different place, which leaves
    // the function declaration without a `declare`.
    // Well luckily both words have the same length, haha :-D
    let code = input.getFullText();
    code = code.replace(/(export\s+)default(\s+(function|class))/m, "$1declare$2");
    for (const fixup of fixups) {
      code = code.slice(0, fixup.range.start) + fixup.identifier + code.slice(fixup.range.end);
    }

    return { code, ast };
  }

  return {
    name: "dts",

    options(options) {
      let { input } = options;
      if (!Array.isArray(input)) {
        input = !input ? [] : typeof input === "string" ? [input] : Object.values(input);
      }
      programs = createPrograms(input);

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

      // normalize directory separators to forward slashes, as apparently typescript expects that?
      importer = importer.split("\\").join("/");

      // resolve this via typescript
      const { resolvedModule } = ts.nodeModuleNameResolver(source, importer, {}, ts.sys);
      if (!resolvedModule) {
        return;
      }

      // here, we define everything that comes from `node_modules` as `external`.
      // maybe its a good idea to introduce an option for this?
      return resolvedModule.isExternalLibraryImport
        ? { id: source, external: true }
        : // using `path.resolve` here converts paths back to the system specific separators
          { id: path.resolve(resolvedModule.resolvedFileName) };
    },

    renderChunk(code, chunk) {
      const pragmas = Array.from(typeReferences, ref => `/// <reference types="${ref}" />\n`).join("");
      const source = ts.createSourceFile(chunk.fileName, code, ts.ScriptTarget.Latest, true);
      const fixer = new NamespaceFixer(source);
      code = pragmas + fixer.fix();
      return { code, map: { mappings: "" } };
    },
  };
};

export default plugin;
