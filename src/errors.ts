import { codeFrameColumns, SourceLocation } from "@babel/code-frame";
import ts from "typescript";

function getCodeFrame(): typeof codeFrameColumns | undefined {
  try {
    const { codeFrameColumns } = require("@babel/code-frame");
    return codeFrameColumns;
  } catch {}
  // istanbul ignore next
  return undefined;
}

function getLocation(node: ts.Node): SourceLocation {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    start: { line: start.line + 1, column: start.character + 1 },
    end: { line: end.line + 1, column: end.character + 1 },
  };
}

function frameNode(node: ts.Node) {
  const codeFrame = getCodeFrame();
  const sourceFile = node.getSourceFile();
  const code = sourceFile.getFullText();

  // istanbul ignore else
  const location = getLocation(node);
  if (codeFrame) {
    return (
      "\n" +
      codeFrame(code, location, {
        highlightCode: true,
      })
    );
  } else {
    return `\n${location.start.line}:${location.start.column}: \`${node.getFullText().trim()}\``;
  }
}

export class UnsupportedSyntaxError extends Error {
  constructor(node: ts.Node, message: string = "Syntax not yet supported") {
    super(`${message}\n${frameNode(node)}`);
  }
}
