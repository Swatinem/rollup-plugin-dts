import * as ts from "typescript";
import * as ESTree from "estree";

const MARKER = "0";
let IDs = 1;

/**
 * Create a new `Program` for the given `node`:
 */
export function createProgram(node: ts.SourceFile): ESTree.Program {
  return withStartEnd(
    {
      type: "Program",
      sourceType: "module",
      body: [],
    },
    node,
  );
}

/**
 * Create an export for `id`:
 * `export default id`
 */
export function createDefaultExport(node: ts.Identifier, range: Ranged) {
  const id = createIdentifier(node, range);
  return withStartEnd<ESTree.ExportDefaultDeclaration>(
    {
      type: "ExportDefaultDeclaration",
      declaration: id,
    },
    range,
  );
}

/**
 * Create an export for `id`:
 * `export { id }`
 */
export function createExport(node: ts.Identifier, range: Ranged) {
  const id = createIdentifier(node, range);
  return withStartEnd<ESTree.ExportNamedDeclaration>(
    {
      type: "ExportNamedDeclaration",
      declaration: null,
      specifiers: [
        {
          type: "ExportSpecifier",
          exported: id,
          local: id,
        },
      ],
    },
    range,
  );
}

/**
 * Creates a reference to `id`:
 * `_ = ${id}`
 */
export function createReference(id: ESTree.Expression): ESTree.AssignmentPattern {
  return {
    type: "AssignmentPattern",
    left: {
      type: "Identifier",
      name: String(IDs++),
    },
    right: id,
  };
}

export function createIdentifier(node: ts.Identifier, range: Ranged = node) {
  return withStartEnd<ESTree.Identifier>(
    {
      type: "Identifier",
      name: node.text || String(node.escapedText),
    },
    range,
  );
}

/**
 * Create a new Declaration and Scope for `id`:
 * `function ${id}(_ = MARKER) {}`
 */
export function createDeclaration(id: ts.Identifier, range: Ranged) {
  const start = getStart(range);
  return withStartEnd<ESTree.FunctionDeclaration>(
    {
      type: "FunctionDeclaration",
      id: withStartEnd(
        {
          type: "Identifier",
          name: id.text,
        },
        { start, end: start },
      ),
      params: [createReference(createIdentifier(id))],
      body: { type: "BlockStatement", body: [] },
    },
    range,
  );
}

export function convertExpression(node: ts.Expression): ESTree.Expression {
  if (ts.isLiteralExpression(node)) {
    return { type: "Literal", value: node.text };
  }
  // istanbul ignore else
  if (ts.isIdentifier(node)) {
    return createIdentifier(node);
  } else {
    console.log({ kind: node.kind, code: node.getFullText() });
    throw new Error(`Unknown Expression`);
  }
}

/**
 * Mark the nested `range` to be removed, by creating dead code:
 * `_ = () => {MARKER}`
 */
export function removeNested(range: Ranged) {
  return createReference({
    type: "FunctionExpression",
    id: null,
    body: withStartEnd(
      {
        type: "BlockStatement",
        body: [
          withStartEnd(
            {
              type: "ExpressionStatement",
              expression: { type: "Identifier", name: MARKER },
            },
            range,
          ),
        ],
      },
      {
        start: getStart(range) - 1,
        end: range.end + 1,
      },
    ),
    params: [],
  });
}

export interface Ranged {
  start?: number;
  pos?: number;
  end: number;
}

interface WithRange {
  start: number;
  end: number;
}

function getStart({ start, pos }: Ranged) {
  return typeof start === "number" ? start : pos || 0;
}

export function withStartEnd<T extends ESTree.Node>(node: T, range: Ranged = { start: 0, end: 0 }): T & WithRange {
  return Object.assign(node, {
    start: getStart(range),
    end: range.end,
  });
}

export function matchesModifier(node: ts.Declaration, flags: ts.ModifierFlags) {
  const nodeFlags = ts.getCombinedModifierFlags(node);
  return (nodeFlags & flags) === flags;
}
