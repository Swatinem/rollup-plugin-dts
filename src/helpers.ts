import ts from "typescript";

export const TS_EXTENSIONS = /\.([cm]ts|[tj]sx?)$/;

export const DTS_EXTENSIONS = /\.d\.(c|m)?tsx?$/;

export const JSON_EXTENSIONS = /\.json$/;

const SUPPORTED_EXTENSIONS = /((\.d)?\.(c|m)?(t|j)sx?|\.json)$/;

export function trimExtension(path: string) {
  return path.replace(SUPPORTED_EXTENSIONS, "")
}

export function getDeclarationId(path: string) {
  return path.replace(SUPPORTED_EXTENSIONS, ".d.ts")
}

export function parse(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
}