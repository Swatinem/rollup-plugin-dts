import * as ESTree from "estree";
import * as ts from "typescript";
import { Transformer } from "./Transformer";
import path from "path";

let SOURCEMAPPING_URL = "sourceMa";
SOURCEMAPPING_URL += "ppingURL";

const SOURCEMAPPING_URL_RE = new RegExp(`^//#\\s+${SOURCEMAPPING_URL}=.+\\n?`, "m");

export enum CompileMode {
  Types = "dts",
  Js = "js",
}

interface CacheOptions {
  tsconfig: string;
  compilerOptions: ts.CompilerOptions;
  mode: CompileMode;
}

interface CacheEntry {
  parsedCompilerOptions: ts.CompilerOptions;
  compiler: ts.Program;
}

const OPTIONS_OVERRIDES: ts.CompilerOptions = {
  module: ts.ModuleKind.ES2015,
  noEmitOnError: false,
  noEmit: false,
  skipLibCheck: true,
  declaration: true,
  allowJs: true,
  checkJs: true,
  resolveJsonModule: true,
  sourceMap: true,
  inlineSourceMap: false,
  declarationMap: true,
};

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
    ...OPTIONS_OVERRIDES,
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

interface EmitFiles {
  dts: string;
  dtsMap: string;
  js: string;
  jsMap: string;
}

function getEmitFiles(compiler: ts.Program, fileName: string): EmitFiles {
  const result: EmitFiles = {
    dts: "",
    dtsMap: `{"mappings": ""}`,
    js: "",
    jsMap: `{"mappings": ""}`,
  };

  if (fileName.endsWith(".d.ts")) {
    result.dts = ts.sys.readFile(fileName, "utf-8")!;
    return result;
  }
  const sourceFile = compiler.getSourceFile(fileName)!;

  // XXX(swatinem): maybe we should look at the diagnostics? :-D
  compiler.emit(sourceFile, (fileName, data) => {
    data = data.replace(SOURCEMAPPING_URL_RE, "").trim();
    if (fileName.endsWith(".d.ts")) {
      result.dts = data;
    } else if (fileName.endsWith(".js")) {
      result.js = data;
      // NOTE(swatinem): hm, there are still issues with this,
      // I couldn’t get it to work locally
      // See https://github.com/Microsoft/TypeScript/issues/25662
      // } else if (fileName.endsWith(".d.ts.map")) {
      //   result.dtsMap = data;
    } else if (fileName.endsWith(".js.map")) {
      result.jsMap = data;
    }
  });

  return result;
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
    resolve(importee: string, importer: string): string | void {
      const { parsedCompilerOptions } = lazyCreate();

      const result = ts.nodeModuleNameResolver(importee, importer, parsedCompilerOptions, ts.sys);
      // hm, maybe we should use `isExternalLibraryImport` at some point…
      // istanbul ignore else
      if (result.resolvedModule && result.resolvedModule.resolvedFileName) {
        return result.resolvedModule.resolvedFileName;
      } else {
        return;
      }
    },
    load(fileName: string): { code: string; map: string; ast?: ESTree.Program } {
      const { compiler } = lazyCreate();

      const emitFiles = getEmitFiles(compiler, fileName);

      if (options.mode === CompileMode.Js) {
        return {
          code: emitFiles.js,
          map: emitFiles.jsMap,
        };
      }

      let code = emitFiles.dts;

      let dtsFileName = fileName;
      if (!fileName.endsWith(".d.ts")) {
        dtsFileName = fileName.slice(0, -path.extname(fileName).length) + ".d.ts";
      }
      const dtsSource = ts.createSourceFile(dtsFileName, code, ts.ScriptTarget.Latest, true);

      const converter = new Transformer(dtsSource);
      const { ast } = converter.transform();

      // NOTE(swatinem):
      // hm, typescript generates `export default` without a declare,
      // but rollup moves the `export default` to a different place, which leaves
      // the function declaration without a `declare`.
      // Well luckily both words have the same length, haha :-D
      code = code.replace(/(export\s+)default(\s+(function|class))/m, "$1declare$2");

      return {
        code,
        ast,
        map: emitFiles.dtsMap,
      };
    },
  };
}
