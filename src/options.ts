// Code is copied from here:
// https://github.com/rollup/rollup-plugin-typescript/blob/7f553800b90fc9abdcd13636b17b4824459d3960/src/options.js#L16-L52
import * as ts from "typescript";
import path from "path";
import { existsSync, readFileSync } from "fs";

// Gratefully lifted from 'look-up', due to problems using it directly:
//   https://github.com/jonschlinkert/look-up/blob/master/index.js
//   MIT Licenced
function findFile(cwd: string, filename: string) {
  let fp = cwd ? cwd + "/" + filename : filename;

  if (existsSync(fp)) {
    return fp;
  }

  const segs = cwd.split(path.sep);
  let len = segs.length;

  while (len--) {
    cwd = segs.slice(0, len).join("/");
    fp = cwd + "/" + filename;
    if (existsSync(fp)) {
      return fp;
    }
  }

  return null;
}

export function getCompilerOptionsFromTsConfig(typescript: typeof ts, tsconfigPath?: string): ts.CompilerOptions {
  if (tsconfigPath && !existsSync(tsconfigPath)) {
    throw new Error(`Could not find specified tsconfig.json at ${tsconfigPath}`);
  }
  const existingTsConfig = tsconfigPath || findFile(process.cwd(), "tsconfig.json");
  if (!existingTsConfig) {
    return {};
  }
  const tsconfig = typescript.readConfigFile(existingTsConfig, path => readFileSync(path, "utf8"));

  if (!tsconfig.config || !tsconfig.config.compilerOptions) return {};
  return tsconfig.config.compilerOptions;
}
