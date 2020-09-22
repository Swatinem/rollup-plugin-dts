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

function frameNodes(nodes: Array<ts.Node>, messages: Array<string> = []) {
  const codeFrame = getCodeFrame();
  const sourceFile = nodes[0].getSourceFile();
  const code = sourceFile.getFullText();

  let output = "";
  let lastLine: number | undefined;
  // oh jesus, why does @babel/code-frame not support this out of the box?
  for (const [i, node] of nodes.entries()) {
    const message = messages[i];
    // istanbul ignore else
    const location = getLocation(node);
    if (codeFrame) {
      const nextLocation = nodes[i + 1] && getLocation(nodes[i + 1]);
      const linesAbove = typeof lastLine === "number" ? location.start.line - lastLine - 1 : 2;
      const linesBelow = nextLocation ? nextLocation.start.line - location.end!.line - 1 : 3;
      output +=
        "\n" +
        codeFrame(code, location, {
          highlightCode: true,
          message,
          linesAbove,
          linesBelow,
        });
      lastLine = location.end!.line + linesBelow;
    } else {
      output += `\n${location.start.line}:${location.start.column}: \`${node.getFullText().trim()}\` <- ${message}`;
    }
  }
  return output;
}

export class UnsupportedSyntaxError extends Error {
  constructor(node: ts.Node, message: string = "Syntax not yet supported") {
    super(`${message}\n${frameNodes([node])}`);
  }
}
