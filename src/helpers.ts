import ts from "typescript";

export function trimExtension(path: string) {
  return path.replace(/((\.d)?\.(c|m)?(t|j)sx?)$/, "")
}

export function parse(fileName: string, code: string): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
}