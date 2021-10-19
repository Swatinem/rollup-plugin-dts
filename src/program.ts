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

function getCompilerOptions(
  input: string,
  overrideOptions: ts.CompilerOptions,
): { dtsFiles: Array<string>; dirName: string; compilerOptions: ts.CompilerOptions } {
  const compilerOptions = { ...DEFAULT_OPTIONS, ...overrideOptions };

  let dirName = path.dirname(input);
  let dtsFiles: Array<string> = [];
  const configPath = ts.findConfigFile(dirName, ts.sys.fileExists);
  if (!configPath) {
    return { dtsFiles, dirName, compilerOptions };
  }
  dirName = path.dirname(configPath);
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    console.error(ts.formatDiagnostic(error, formatHost));
    return { dtsFiles, dirName, compilerOptions };
  }
  const { fileNames, options, errors } = ts.parseJsonConfigFileContent(config, ts.sys, dirName);

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

export function createProgram(fileName: string, overrideOptions: ts.CompilerOptions) {
  const { dtsFiles, compilerOptions } = getCompilerOptions(fileName, overrideOptions);
  return ts.createProgram(
    [fileName].concat(Array.from(dtsFiles)),
    compilerOptions,
    ts.createCompilerHost(compilerOptions, true),
  );
}

export function createPrograms(input: Array<string>, overrideOptions: ts.CompilerOptions) {
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
    const options = getCompilerOptions(main, overrideOptions);
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
