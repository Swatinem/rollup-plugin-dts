import * as ts from "typescript";
import { PluginImpl } from "rollup";
import { Transformer } from "./Transformer";
import { NamespaceFixer } from "./NamespaceFixer";

const plugin: PluginImpl<{}> = () => {
  return {
    name: "dts",

    options(options) {
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
        chunkFileNames: options.chunkFileNames || "[name]-[hash].d.ts",
        entryFileNames: options.entryFileNames || "[name].d.ts",
        format: "es",
        exports: "named",
        compact: false,
        freeze: true,
        interop: false,
        namespaceToStringTag: false,
        strict: false,
      };
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
      if (resolvedModule.isExternalLibraryImport) {
        return { id: source, external: true };
      }
      let id = resolvedModule.resolvedFileName;
      const { extension } = resolvedModule;
      if (extension !== ".d.ts") {
        // ts resolves `.ts`/`.tsx` files before `.d.ts`
        id = id.slice(0, id.length - extension.length) + ".d.ts";
      }

      return { id };
    },

    transform(code, id) {
      if (!id.endsWith(".d.ts")) {
        this.error("`rollup-plugin-dts` can only deal with `.d.ts` files.");
        return;
      }

      const dtsSource = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true);
      const converter = new Transformer(dtsSource);
      const { ast, fixups } = converter.transform();

      // NOTE(swatinem):
      // hm, typescript generates `export default` without a declare,
      // but rollup moves the `export default` to a different place, which leaves
      // the function declaration without a `declare`.
      // Well luckily both words have the same length, haha :-D
      code = code.replace(/(export\s+)default(\s+(function|class))/m, "$1declare$2");
      for (const fixup of fixups) {
        code = code.slice(0, fixup.range.start) + fixup.identifier + code.slice(fixup.range.end);
      }

      return { code, ast };
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
