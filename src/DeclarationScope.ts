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

  /**
   * As we walk the AST, we need to keep track of type variable bindings that
   * shadow the outer identifiers. To achieve this, we keep a stack of scopes,
   * represented as Sets of variable names.
   */
  scopes: Array<Set<string>> = [];
  pushScope() {
    this.scopes.push(new Set());
  }
  popScope(n = 1) {
    for (let i = 0; i < n; i++) {
      this.scopes.pop();
    }
  }
  pushTypeVariable(id: ts.Identifier) {
    const name = id.getText();
    this.scopes[this.scopes.length - 1].add(name);
  }

  pushRaw(expr: ESTree.AssignmentPattern) {
    this.declaration.params.push(expr);
  }
  pushReference(id: ESTree.Expression) {
    let name: string | undefined;
    // We convert references from TS AST to ESTree
    // to hand them off to rollup.
    // This means we have to check the left-most identifier inside our scope
    // tree and avoid to create the reference in that case
    if (id.type === "Identifier") {
      name = id.name;
    } else if (id.type === "MemberExpression") {
      if (id.object.type === "Identifier") {
        name = id.object.name;
      }
    }
    if (name) {
      for (const scope of this.scopes) {
        if (scope.has(name)) {
          return;
        }
      }
    }
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
    const typeVariables = this.convertTypeParameters(node.typeParameters);
    for (const param of node.parameters) {
      this.convertTypeNode(param.type);
    }
    this.convertTypeNode(node.type);
    this.popScope(typeVariables);
  }

  convertHeritageClauses(node: ts.InterfaceDeclaration | ts.ClassDeclaration) {
    for (const heritage of node.heritageClauses || []) {
      for (const type of heritage.types) {
        this.pushReference(convertExpression(type.expression));
        for (const arg of type.typeArguments || []) {
          this.convertTypeNode(arg);
        }
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
      return 0;
    }
    for (const node of params) {
      this.pushScope();
      this.pushTypeVariable(node.name);
      this.convertTypeNode(node.default);
    }
    return params.length;
  }

  convertTypeNode(node?: ts.TypeNode): any {
    if (!node) {
      return;
    }
    if (IGNORE_TYPENODES.has(node.kind)) {
      return;
    }
    if (ts.isTypeReferenceNode(node)) {
      this.pushReference(this.convertEntityName(node.typeName));
      for (const arg of node.typeArguments || []) {
        this.convertTypeNode(arg);
      }
      return;
    }
    if (ts.isTypeLiteralNode(node)) {
      return this.convertMembers(node.members);
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
    if (ts.isParenthesizedTypeNode(node) || ts.isTypeOperatorNode(node) || ts.isTypePredicateNode(node)) {
      return this.convertTypeNode(node.type);
    }
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      for (const type of node.types) {
        this.convertTypeNode(type);
      }
      return;
    }
    if (ts.isMappedTypeNode(node)) {
      const { typeParameter, type } = node;
      this.convertTypeNode(typeParameter.constraint);
      this.pushScope();
      this.pushTypeVariable(node.typeParameter.name);
      this.convertTypeNode(type);
      this.popScope();
      return;
    }
    if (ts.isConditionalTypeNode(node)) {
      this.convertTypeNode(node.checkType);
      this.pushScope();
      this.convertTypeNode(node.extendsType);
      this.convertTypeNode(node.trueType);
      this.convertTypeNode(node.falseType);
      this.popScope();
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
    if (ts.isInferTypeNode(node)) {
      this.pushTypeVariable(node.typeParameter.name);
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
