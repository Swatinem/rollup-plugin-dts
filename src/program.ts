import * as path from "path";
import * as ts from "typescript";

export const dts = ".d.ts";

export const formatHost: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  getNewLine: () => ts.sys.newLine,
  getCanonicalFileName: ts.sys.useCaseSensitiveFileNames ? f => f : f => f.toLowerCase(),
};

const OPTIONS_OVERRIDE: ts.CompilerOptions = {
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
  // Ensure we can parse the latest code
  target: ts.ScriptTarget.ESNext,
};

function getCompilerOptions(input: string): { dirName: string; compilerOptions: ts.CompilerOptions } {
  let dirName = path.dirname(input);
  const configPath = ts.findConfigFile(path.dirname(input), ts.sys.fileExists);
  if (!configPath) {
    return { dirName, compilerOptions: { ...OPTIONS_OVERRIDE } };
  }
  dirName = path.dirname(configPath);
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  if (error) {
    console.error(ts.formatDiagnostic(error, formatHost));
    return { dirName, compilerOptions: { ...OPTIONS_OVERRIDE } };
  }
  const { options, errors } = ts.parseJsonConfigFileContent(config, ts.sys, dirName);
  if (errors.length) {
    console.error(ts.formatDiagnostics(errors, formatHost));
    return { dirName, compilerOptions: { ...OPTIONS_OVERRIDE } };
  }
  return {
    dirName,
    compilerOptions: {
      ...options,
      ...OPTIONS_OVERRIDE,
    },
  };
}

export function createPrograms(input: Array<string>) {
  const programs = [];
  let inputs: Array<string> = [];
  let dirName = "";
  let compilerOptions: ts.CompilerOptions = {};

  for (let main of input) {
    if (main.endsWith(dts)) {
      continue;
    }

    main = path.resolve(main);
    const options = getCompilerOptions(main);

    if (!inputs.length) {
      inputs.push(main);
      ({ dirName, compilerOptions } = options);
      continue;
    }

    if (options.dirName === dirName) {
      inputs.push(main);
    } else {
      const host = ts.createCompilerHost(compilerOptions, true);
      const program = ts.createProgram(inputs, compilerOptions, host);
      programs.push(program);

      inputs = [main];
      ({ dirName, compilerOptions } = options);
    }
  }

  if (inputs.length) {
    const host = ts.createCompilerHost(compilerOptions, true);
    const program = ts.createProgram(inputs, compilerOptions, host);
    programs.push(program);
  }

  return programs;
}
