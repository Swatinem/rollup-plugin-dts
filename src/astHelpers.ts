import * as ts from "typescript";
import * as ESTree from "estree";
import { UnsupportedSyntaxError } from "./errors";

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
 * Create a default export for `id`:
 * `export default id`
 */
export function createDefaultExport(node: ts.Identifier, range: Ranged) {
  return withStartEnd<ESTree.ExportDefaultDeclaration>(
    {
      type: "ExportDefaultDeclaration",
      declaration: createIdentifier(node),
    },
    range,
  );
}

/**
 * Create an export for `id`:
 * `export { id }`
 */
export function createExport(node: ts.Identifier, range: Ranged) {
  const id = createIdentifier(node);
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

export function createIdentifier(node: ts.Identifier) {
  return withStartEnd<ESTree.Identifier>(
    {
      type: "Identifier",
      name: node.getText(),
    },
    {
      start: node.getStart(),
      end: node.getEnd(),
    },
  );
}

/**
 * Create a new Scope which is always included
 * `(function (_ = MARKER) {})()`
 */
export function createIIFE(range: Ranged) {
  const fn = withStartEnd<ESTree.FunctionExpression>(
    {
      type: "FunctionExpression",
      id: null,
      params: [],
      body: { type: "BlockStatement", body: [] },
    },
    range,
  );
  const iife = withStartEnd<ESTree.ExpressionStatement>(
    {
      type: "ExpressionStatement",
      expression: {
        type: "CallExpression",
        callee: { type: "Identifier", name: String(IDs++) },
        arguments: [fn],
      },
    },
    range,
  );
  return { fn, iife };
}

/**
 * Create a new Declaration and Scope for `id`:
 * `function ${id}(_ = MARKER) {}`
 */
export function createDeclaration(id: ts.Identifier, range: Ranged) {
  return withStartEnd<ESTree.FunctionDeclaration>(
    {
      type: "FunctionDeclaration",
      id: withStartEnd(
        {
          type: "Identifier",
          name: ts.idText(id),
        },
        { start: id.getStart(), end: id.getEnd() },
      ),
      params: [],
      body: { type: "BlockStatement", body: [] },
    },
    range,
  );
}

export function convertExpression(node: ts.Expression): ESTree.Expression {
  if (ts.isLiteralExpression(node)) {
    return { type: "Literal", value: node.text };
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (ts.isPrivateIdentifier(node.name)) {
      throw new UnsupportedSyntaxError(node.name);
    }
    return withStartEnd(
      {
        type: "MemberExpression",
        computed: false,
        object: convertExpression(node.expression),
        property: convertExpression(node.name),
      },
      {
        start: node.expression.getStart(),
        end: node.name.getEnd(),
      },
    );
  }
  // istanbul ignore else
  if (ts.isIdentifier(node)) {
    return createIdentifier(node);
  } else {
    throw new UnsupportedSyntaxError(node);
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

export function withStartEnd<T extends ESTree.Node>(node: T, range: Ranged): T & WithRange {
  return Object.assign(node, {
    start: getStart(range),
    end: range.end,
  });
}

export function matchesModifier(node: ts.Node, flags: ts.ModifierFlags) {
  const nodeFlags = ts.getCombinedModifierFlags(node as any);
  return (nodeFlags & flags) === flags;
}

export const isNamespaceDeclaration = (node: ts.ModuleDeclaration) => {
  return node.modifiers && (node.name.pos - node.modifiers[node.modifiers?.length - 1].end) === 10 /* "namespace".length + 1 */
}
