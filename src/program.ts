import * as path from "path";
import ts from "typescript";

export const dts = ".d.ts";

export const formatHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  getNewLine: () => ts.sys.newLine,
  getCanonicalFileName: ts.sys.useCaseSensitiveFileNames ? (f) => f : (f) => f.toLowerCase(),
};

const DEFAULT_OPTIONS: ts.CompilerOptions = {
  // Ensure ".d.ts" modules are generated
  declaration: true,
  // Skip ".js" generation
  noEmit: false,
  emitDeclarationOnly: true,
  // Skip code generation when error occurs
  noEmitOnError: true,
  // Avoid extra work
  checkJs: false,
  declarationMap: false,
  skipLibCheck: true,
  // Ensure TS2742 errors are visible
  preserveSymlinks: true,
  // Ensure we can parse the latest code
  target: ts.ScriptTarget.ESNext,
};

const configByPath = new Map<string, ts.ParsedCommandLine>();

const logCache = (...args: any[]) => (process.env.DTS_LOG_CACHE ? console.log("[cache]", ...args) : null);

/**
 * Caches the config for every path between two given paths.
 *
 * It starts from the first path and walks up the directory tree until it reaches the second path.
 */
function cacheConfig([fromPath, toPath]: [from: string, to: string], config: ts.ParsedCommandLine) {
  logCache(fromPath);
  configByPath.set(fromPath, config);
  while (
    fromPath !== toPath &&
    // make sure we're not stuck in an infinite loop
    fromPath !== path.dirname(fromPath)
  ) {
    fromPath = path.dirname(fromPath);
    logCache("up", fromPath);
    if (configByPath.has(fromPath)) return logCache("has", fromPath);
    configByPath.set(fromPath, config);
  }
}

export function getCompilerOptions(
  input: string,
  overrideOptions: ts.CompilerOptions,
  overrideConfigPath?: string,
): { dtsFiles: Array<string>; dirName: string; compilerOptions: ts.CompilerOptions } {
  const compilerOptions = { ...DEFAULT_OPTIONS, ...overrideOptions };
  let dirName = path.dirname(input);
  let dtsFiles: Array<string> = [];

  // if a custom config is provided we'll use that as the cache key since it will always be used
  const cacheKey = overrideConfigPath || dirName;
  if (!configByPath.has(cacheKey)) {
    logCache("miss", cacheKey);
    const configPath = overrideConfigPath
      ? path.resolve(process.cwd(), overrideConfigPath)
      : ts.findConfigFile(dirName, ts.sys.fileExists);
    if (!configPath) {
      return { dtsFiles, dirName, compilerOptions };
    }
    let inputDirName = dirName;
    dirName = path.dirname(configPath);
    const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
    if (error) {
      console.error(ts.formatDiagnostic(error, formatHost));
      return { dtsFiles, dirName, compilerOptions };
    }
    logCache("tsconfig", config);
    const configContents = ts.parseJsonConfigFileContent(config, ts.sys, dirName);
    if (overrideConfigPath) {
      // if a custom config is provided, we always only use that one
      cacheConfig([overrideConfigPath, overrideConfigPath], configContents);
    } else {
      // cache the config for all directories between input and resolved config path
      cacheConfig([inputDirName, dirName], configContents);
    }
  } else {
    logCache("HIT", cacheKey);
  }
  const { fileNames, options, errors } = configByPath.get(cacheKey)!;

  dtsFiles = fileNames.filter((name) => name.endsWith(dts));
  if (errors.length) {
    console.error(ts.formatDiagnostics(errors, formatHost));
    return { dtsFiles, dirName, compilerOptions };
  }
  return {
    dtsFiles,
    dirName,
    compilerOptions: {
      ...options,
      ...compilerOptions,
    },
  };
}

export function createProgram(fileName: string, overrideOptions: ts.CompilerOptions, tsconfig?: string) {
  const { dtsFiles, compilerOptions } = getCompilerOptions(fileName, overrideOptions, tsconfig);
  return ts.createProgram(
    [fileName].concat(Array.from(dtsFiles)),
    compilerOptions,
    ts.createCompilerHost(compilerOptions, true),
  );
}

export function createPrograms(input: Array<string>, overrideOptions: ts.CompilerOptions, tsconfig?: string) {
  const programs = [];
  let inputs: Array<string> = [];
  let dtsFiles: Set<string> = new Set();
  let dirName = "";
  let compilerOptions: ts.CompilerOptions = {};

  for (let main of input) {
    if (main.endsWith(dts)) {
      continue;
    }

    main = path.resolve(main);
    const options = getCompilerOptions(main, overrideOptions, tsconfig);
    options.dtsFiles.forEach(dtsFiles.add, dtsFiles);

    if (!inputs.length) {
      inputs.push(main);
      ({ dirName, compilerOptions } = options);
      continue;
    }

    if (options.dirName === dirName) {
      inputs.push(main);
    } else {
      const host = ts.createCompilerHost(compilerOptions, true);
      const program = ts.createProgram(inputs.concat(Array.from(dtsFiles)), compilerOptions, host);
      programs.push(program);

      inputs = [main];
      ({ dirName, compilerOptions } = options);
    }
  }

  if (inputs.length) {
    const host = ts.createCompilerHost(compilerOptions, true);
    const program = ts.createProgram(inputs.concat(Array.from(dtsFiles)), compilerOptions, host);
    programs.push(program);
  }

  return programs;
}
