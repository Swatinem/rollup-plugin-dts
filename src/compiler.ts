import * as ts from "typescript";
import { Transformer } from "./transformer";

let SOURCEMAPPING_URL = "sourceMa";
SOURCEMAPPING_URL += "ppingURL";

const SOURCEMAPPING_URL_RE = new RegExp(`^//#\\s+${SOURCEMAPPING_URL}=.+\\n?`, "m");

interface CacheOptions {
  tsconfig: string;
  compilerOptions: ts.CompilerOptions;
}

interface CacheEntry {
  parsedCompilerOptions: ts.CompilerOptions;
  compiler: ts.Program;
}

const COMPILERCACHE = new Map<string, CacheEntry>();

function createCompiler(options: CacheOptions) {
  const configFileName = ts.findConfigFile(options.tsconfig, ts.sys.fileExists);

  if (!configFileName) {
    throw new Error(`rollup-plugin-dts: Couldn't find tsconfig file`);
  }

  const compilerOptions: ts.CompilerOptions = {
    ...options.compilerOptions,
    noEmitOnError: false,
    noEmit: false,
    skipLibCheck: true,
    declaration: true,
    // hm, there are still issues with this, I couldn’t get it to work locally
    // See https://github.com/Microsoft/TypeScript/issues/25662
    declarationMap: false,
  };

  let diagnostic;
  const configParseResult = ts.getParsedCommandLineOfConfigFile(configFileName, compilerOptions, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(d) {
      diagnostic = d;
    },
  });
  if (!configParseResult) {
    console.log(diagnostic);
    throw new Error(`rollup-plugin-dts: Couldn't process compiler options`);
  }
  const { fileNames, options: parsedCompilerOptions } = configParseResult;

  return {
    parsedCompilerOptions,
    compiler: ts.createProgram(fileNames, parsedCompilerOptions),
  };
}

export function getCachedCompiler(options: CacheOptions) {
  const cacheKey = JSON.stringify(options);

  function lazyCreate() {
    let compiler = COMPILERCACHE.get(cacheKey);
    if (!compiler) {
      compiler = createCompiler(options);
      COMPILERCACHE.set(cacheKey, compiler);
    }
    return compiler;
  }

  return {
    get compiler(): ts.Program {
      return lazyCreate().compiler;
    },
    resolve(importee: string, importer: string): string | null {
      const { parsedCompilerOptions } = lazyCreate();

      const result = ts.nodeModuleNameResolver(importee, importer, parsedCompilerOptions, ts.sys);
      if (result.resolvedModule && result.resolvedModule.resolvedFileName) {
        return result.resolvedModule.resolvedFileName;
      }
      return null;
    },
    transform(fileName: string) {
      const { compiler } = lazyCreate();

      const sourceFile = compiler.getSourceFile(fileName)!;

      let dtsFilename = "";
      let code = "";
      let map = `{"mappings": ""}`;
      compiler.emit(sourceFile, (fileName, data) => {
        if (fileName.endsWith(".d.ts")) {
          dtsFilename = fileName;
          code = data.replace(SOURCEMAPPING_URL_RE, "").trim();
        }
        if (fileName.endsWith(".d.ts.map")) {
          map = data;
        }
      });

      const dtsSource = ts.createSourceFile(dtsFilename, code, ts.ScriptTarget.Latest);

      const converter = new Transformer(dtsSource);
      return {
        code,
        ast: converter.transform(),
        map,
      };
    },
    // invalidate() {
    //   COMPILERCACHE.delete(cacheKey);
    // },
  };
}
