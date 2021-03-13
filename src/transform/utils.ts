import ts from "typescript";

export function getStart(node: ts.Node): number {
  const start = node.getFullStart();
  return start + newlineAt(node, start);
}
export function getEnd(node: ts.Node): number {
  const end = node.getEnd();
  return end + newlineAt(node, end);
}
function newlineAt(node: ts.Node, idx: number): number {
  const code = node.getSourceFile().getFullText();
  if (code[idx] == "\n") {
    return 1;
  }
  return 0;
}
