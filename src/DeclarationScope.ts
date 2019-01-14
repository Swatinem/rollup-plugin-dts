import * as ts from "typescript";
import * as ESTree from "estree";
import {
  Ranged,
  createDeclaration,
  createReference,
  createIdentifier,
  removeNested,
  withStartEnd,
  convertExpression,
  isInternal,
} from "./astHelpers";

const IGNORE_TYPENODES = new Set([
  ts.SyntaxKind.LiteralType,
  ts.SyntaxKind.VoidKeyword,
  ts.SyntaxKind.UnknownKeyword,
  ts.SyntaxKind.AnyKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.ObjectKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.UndefinedKeyword,
  ts.SyntaxKind.SymbolKeyword,
  ts.SyntaxKind.NeverKeyword,
  ts.SyntaxKind.ThisKeyword,
]);

export class DeclarationScope {
  declaration: ESTree.FunctionDeclaration;

  constructor(id: ts.Identifier, range: Ranged) {
    this.declaration = createDeclaration(id, range);
  }

  pushRaw(expr: ESTree.AssignmentPattern) {
    this.declaration.params.push(expr);
  }
  pushReference(id: ESTree.Expression) {
    this.pushRaw(createReference(id));
  }
  pushIdentifierReference(id: ts.Identifier) {
    this.pushReference(createIdentifier(id));
  }

  removeModifier(node: ts.Node, kind: ts.SyntaxKind = ts.SyntaxKind.ExportKeyword) {
    for (const mod of node.modifiers || []) {
      if (mod.kind === kind) {
        const start = node.getStart();
        const end = mod.end + 1;
        this.pushRaw(removeNested({ start, end }));
      }
    }
  }

  convertParametersAndType(node: ts.SignatureDeclarationBase) {
    for (const param of node.parameters) {
      this.convertTypeNode(param.type);
    }
    this.convertTypeParameters(node.typeParameters);
    this.convertTypeNode(node.type);
  }

  convertHeritageClauses(node: ts.InterfaceDeclaration | ts.ClassDeclaration) {
    for (const heritage of node.heritageClauses || []) {
      for (const type of heritage.types) {
        this.pushReference(convertExpression(type.expression));
      }
    }
  }

  convertMembers(members: ts.NodeArray<ts.TypeElement | ts.ClassElement>) {
    for (const node of members) {
      // NOTE(swatinem):
      // Well, actually having `private`/`protected` members in the exported
      // definitions is quite nice, so let’s keep them. Instead we look for an
      // `@internal` tag
      // if (matchesModifier(node, ts.ModifierFlags.Private) || matchesModifier(node, ts.ModifierFlags.Protected)) {
      if (isInternal(node)) {
        this.pushRaw(removeNested({ start: node.getFullStart(), end: node.getEnd() }));
        continue;
      }
      if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isIndexSignatureDeclaration(node)) {
        this.convertTypeNode(node.type);
        continue;
      }
      // istanbul ignore else
      if (
        ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isConstructSignatureDeclaration(node)
      ) {
        this.convertParametersAndType(node);
      } else {
        console.log({ kind: node.kind, code: node.getFullText() });
        throw new Error(`Unknown TypeElement`);
      }
    }
  }

  convertTypeParameters(params?: ts.NodeArray<ts.TypeParameterDeclaration>) {
    if (!params) {
      return;
    }
    for (const node of params) {
      this.convertTypeNode(node.default);
    }
  }

  convertTypeNode(node?: ts.TypeNode): any {
    if (!node) {
      return;
    }
    if (IGNORE_TYPENODES.has(node.kind)) {
      return;
    }
    if (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node)) {
      return this.convertTypeNode(node.type);
    }
    if (ts.isArrayTypeNode(node)) {
      return this.convertTypeNode(node.elementType);
    }
    if (ts.isTupleTypeNode(node)) {
      for (const type of node.elementTypes) {
        this.convertTypeNode(type);
      }
      return;
    }
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      for (const type of node.types) {
        this.convertTypeNode(type);
      }
      return;
    }
    if (ts.isTypeLiteralNode(node)) {
      return this.convertMembers(node.members);
    }
    if (ts.isMappedTypeNode(node)) {
      const { typeParameter, type } = node;
      this.convertTypeNode(typeParameter.constraint);
      // TODO: create scopes for the name
      // node.typeParameter.name
      this.convertTypeNode(type);
      return;
    }
    if (ts.isConditionalTypeNode(node)) {
      this.convertTypeNode(node.checkType);
      // TODO: create scopes for `infer`
      this.convertTypeNode(node.extendsType);
      this.convertTypeNode(node.trueType);
      this.convertTypeNode(node.falseType);
      return;
    }
    if (ts.isIndexedAccessTypeNode(node)) {
      this.convertTypeNode(node.objectType);
      this.convertTypeNode(node.indexType);
      return;
    }
    if (ts.isFunctionOrConstructorTypeNode(node)) {
      this.convertParametersAndType(node);
      return;
    }
    // istanbul ignore else
    if (ts.isTypeReferenceNode(node)) {
      this.pushReference(this.convertEntityName(node.typeName));
      for (const arg of node.typeArguments || []) {
        this.convertTypeNode(arg);
      }
      return;
    } else {
      console.log(node.getSourceFile().getFullText());
      console.log({ kind: node.kind, code: node.getFullText() });
      throw new Error(`Unknown TypeNode`);
    }
  }

  convertEntityName(node: ts.EntityName): ESTree.Expression {
    if (ts.isIdentifier(node)) {
      return createIdentifier(node);
    }
    return withStartEnd(
      {
        type: "MemberExpression",
        computed: false,
        object: this.convertEntityName(node.left),
        property: createIdentifier(node.right),
      },
      // TODO: clean up all the `start` handling!
      { start: node.getStart(), end: node.end },
    );
  }
}
