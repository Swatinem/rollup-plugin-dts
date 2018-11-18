import * as ts from "typescript";
import { Transformer } from "./Transformer";
import path from "path";

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
  const file = path.basename(options.tsconfig);
  const configFileName = ts.findConfigFile(
    options.tsconfig,
    ts.sys.fileExists,
    path.extname(options.tsconfig) ? file : undefined,
  );

  // istanbul ignore if
  if (!configFileName) {
    throw new Error(`rollup-plugin-dts: Couldn't find tsconfig file`);
  }

  const compilerOptions: ts.CompilerOptions = {
    ...options.compilerOptions,
    noEmitOnError: false,
    noEmit: false,
    skipLibCheck: true,
    declaration: true,
    allowJs: true,
    checkJs: true,
    resolveJsonModule: true,
    // hm, there are still issues with this, I couldn’t get it to work locally
    // See https://github.com/Microsoft/TypeScript/issues/25662
    declarationMap: false,
  };

  let diagnostic;
  const configParseResult = ts.getParsedCommandLineOfConfigFile(configFileName, compilerOptions, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(d) {
      // istanbul ignore next
      diagnostic = d;
    },
  });
  // istanbul ignore if
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
    resolve(importee: string, importer: string): string | null {
      const { parsedCompilerOptions } = lazyCreate();

      const result = ts.nodeModuleNameResolver(importee, importer, parsedCompilerOptions, ts.sys);
      // istanbul ignore else
      if (result.resolvedModule && result.resolvedModule.resolvedFileName) {
        return result.resolvedModule.resolvedFileName;
      } else {
        return null;
      }
    },
    transform(code: string, fileName: string) {
      const { compiler } = lazyCreate();

      const sourceFile = compiler.getSourceFile(fileName)!;

      let dtsSource = sourceFile;
      let dtsFilename = fileName;
      let map = `{"mappings": ""}`;

      if (!fileName.endsWith(".d.ts")) {
        code = "";
        const baseFileName = fileName.slice(0, -path.extname(fileName).length);
        compiler.emit(sourceFile, (fileName, data) => {
          if (fileName === `${baseFileName}.d.ts`) {
            dtsFilename = fileName;
            code = data.replace(SOURCEMAPPING_URL_RE, "").trim();
          }
          // if (fileName === `${baseFileName}.d.ts.map`) {
          //   map = data;
          // }
        });

        dtsSource = ts.createSourceFile(dtsFilename, code, ts.ScriptTarget.Latest, true);
      } else {
        // TODO(swatinem):
        // maybe load the `map` from a pre-existing map file?
      }

      const converter = new Transformer(dtsSource);
      const ast = converter.transform();

      // NOTE(swatinem):
      // hm, typescript generates `export default` without a declare,
      // but rollup moves the `export default` to a different place, which leaves
      // the function declaration without a `declare`.
      // Well luckily both words have the same length, haha :-D
      code = code.replace(/(export\s+)default(\s+(function|class))/m, "$1declare$2");

      return { code, ast, map };
    },
    // invalidate() {
    //   COMPILERCACHE.delete(cacheKey);
    // },
  };
}
