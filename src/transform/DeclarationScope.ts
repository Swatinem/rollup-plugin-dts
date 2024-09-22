import type * as ESTree from "estree";
import ts from "typescript";
import {
  convertExpression,
  createDeclaration,
  createIdentifier,
  createIIFE,
  createReference,
  createReturn,
  type Range,
  withStartEnd,
} from "./astHelpers.js";
import { UnsupportedSyntaxError } from "./errors.js";

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
  ts.SyntaxKind.ThisType,
  ts.SyntaxKind.BigIntKeyword,
]);

interface DeclarationScopeOptions {
  id?: ts.Identifier;
  range: Range;
}

export class DeclarationScope {
  declaration: ESTree.FunctionDeclaration;
  iife?: ESTree.ExpressionStatement;
  private returnExpr: ESTree.ArrayExpression;

  constructor({ id, range }: DeclarationScopeOptions) {
    if (id) {
      this.declaration = createDeclaration(id, range);
    } else {
      const { iife, fn } = createIIFE(range);
      this.iife = iife;
      this.declaration = fn as any;
    }
    const ret = createReturn();
    this.declaration.body.body.push(ret.stmt);
    this.returnExpr = ret.expr;
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
    this.scopes[this.scopes.length - 1]?.add(name);
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
    // `this` is a reserved keyword that retrains meaning in certain Type-only contexts, including classes
    if (name === "this") return;
    const { ident, expr } = createReference(id);

    this.declaration.params.push(expr);
    this.returnExpr.elements.push(ident);
  }
  pushIdentifierReference(id: ts.Identifier | ts.StringLiteral) {
    this.pushReference(createIdentifier(id));
  }

  convertEntityName(node: ts.EntityName): ESTree.Expression {
    if (ts.isIdentifier(node)) {
      return createIdentifier(node);
    }
    return withStartEnd(
      {
        type: "MemberExpression",
        computed: false,
        optional: false,
        object: this.convertEntityName(node.left),
        property: createIdentifier(node.right),
      },
      node,
    );
  }

  convertPropertyAccess(node: ts.PropertyAccessExpression): ESTree.Expression {
    // hm, we only care about property access expressions here…
    if (!ts.isIdentifier(node.expression) && !ts.isPropertyAccessExpression(node.expression)) {
      throw new UnsupportedSyntaxError(node.expression);
    }

    if (ts.isPrivateIdentifier(node.name)) {
      throw new UnsupportedSyntaxError(node.name);
    }

    const object = ts.isIdentifier(node.expression)
      ? createIdentifier(node.expression)
      : this.convertPropertyAccess(node.expression);

    return withStartEnd(
      {
        type: "MemberExpression",
        computed: false,
        optional: false,
        object,
        property: createIdentifier(node.name),
      },
      node,
    );
  }

  convertComputedPropertyName(node: { name?: ts.PropertyName }) {
    if (!node.name || !ts.isComputedPropertyName(node.name)) {
      return;
    }
    const { expression } = node.name;
    if (ts.isLiteralExpression(expression) || ts.isPrefixUnaryExpression(expression)) {
      return;
    }
    if (ts.isIdentifier(expression)) {
      return this.pushReference(createIdentifier(expression));
    }
    if (ts.isPropertyAccessExpression(expression)) {
      return this.pushReference(this.convertPropertyAccess(expression));
    }
    throw new UnsupportedSyntaxError(expression);
  }

  convertParametersAndType(node: ts.SignatureDeclarationBase) {
    this.convertComputedPropertyName(node);
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
        this.convertTypeArguments(type);
      }
    }
  }

  convertTypeArguments(node: ts.NodeWithTypeArguments) {
    if (!node.typeArguments) {
      return;
    }
    for (const arg of node.typeArguments) {
      this.convertTypeNode(arg);
    }
  }

  convertMembers(members: ts.NodeArray<ts.TypeElement | ts.ClassElement>): void {
    for (const node of members) {
      if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isIndexSignatureDeclaration(node)) {
        if (ts.isPropertyDeclaration(node) && node.initializer && ts.isPropertyAccessExpression(node.initializer)) {
          this.pushReference(this.convertPropertyAccess(node.initializer));
        }
        this.convertComputedPropertyName(node);
        this.convertTypeNode(node.type);
        continue;
      }
      if (
        ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isConstructSignatureDeclaration(node) ||
        ts.isCallSignatureDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)
      ) {
        this.convertParametersAndType(node);
      } else {
        throw new UnsupportedSyntaxError(node);
      }
    }
  }

  convertTypeParameters(params?: ts.NodeArray<ts.TypeParameterDeclaration>) {
    if (!params) {
      return 0;
    }
    for (const node of params) {
      this.convertTypeNode(node.constraint);
      this.convertTypeNode(node.default);
      this.pushScope();
      this.pushTypeVariable(node.name);
    }
    return params.length;
  }

  convertTypeNode(node?: ts.TypeNode): void {
    if (!node) {
      return;
    }
    if (IGNORE_TYPENODES.has(node.kind)) {
      return;
    }
    if (ts.isTypeReferenceNode(node)) {
      this.pushReference(this.convertEntityName(node.typeName));
      this.convertTypeArguments(node);
      return;
    }
    if (ts.isTypeLiteralNode(node)) {
      this.convertMembers(node.members);
      return;
    }

    if (ts.isArrayTypeNode(node)) {
      this.convertTypeNode(node.elementType);
      return;
    }
    if (ts.isTupleTypeNode(node)) {
      for (const type of node.elements) {
        this.convertTypeNode(type);
      }
      return;
    }
    if (
      ts.isNamedTupleMember(node) ||
      ts.isParenthesizedTypeNode(node) ||
      ts.isTypeOperatorNode(node) ||
      ts.isTypePredicateNode(node)
    ) {
      this.convertTypeNode(node.type);
      return;
    }
    if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
      for (const type of node.types) {
        this.convertTypeNode(type);
      }
      return;
    }
    if (ts.isMappedTypeNode(node)) {
      const { typeParameter, type, nameType } = node;
      this.convertTypeNode(typeParameter.constraint);
      this.pushScope();
      this.pushTypeVariable(typeParameter.name);
      this.convertTypeNode(type);
      if (nameType) {
        this.convertTypeNode(nameType);
      }
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
    if (ts.isTypeQueryNode(node)) {
      this.pushReference(this.convertEntityName(node.exprName));
      return;
    }
    if (ts.isRestTypeNode(node)) {
      this.convertTypeNode(node.type);
      return;
    }
    if (ts.isOptionalTypeNode(node)) {
      this.convertTypeNode(node.type);
      return;
    }
    if (ts.isTemplateLiteralTypeNode(node)) {
      for (const span of node.templateSpans) {
        this.convertTypeNode(span.type);
      }
      return;
    }

    if (ts.isInferTypeNode(node)) {
      const { typeParameter } = node;
      this.convertTypeNode(typeParameter.constraint);
      this.pushTypeVariable(typeParameter.name);
      return;
    } else {
      throw new UnsupportedSyntaxError(node);
    }
  }

  convertNamespace(node: ts.ModuleDeclaration, relaxedModuleBlock = false) {
    this.pushScope();

    if (relaxedModuleBlock && node.body && ts.isModuleDeclaration(node.body)) {
      this.convertNamespace(node.body, true);
      return;
    }
    if (!node.body || !ts.isModuleBlock(node.body)) {
      throw new UnsupportedSyntaxError(node, `namespace must have a "ModuleBlock" body.`);
    }

    const { statements } = node.body;

    // first, hoist all the declarations for correct shadowing
    for (const stmt of statements) {
      if (
        ts.isEnumDeclaration(stmt) ||
        ts.isFunctionDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isModuleDeclaration(stmt)
      ) {
        if (stmt.name && ts.isIdentifier(stmt.name)) {
          this.pushTypeVariable(stmt.name);
        } else {
          throw new UnsupportedSyntaxError(stmt, "non-Identifier name not supported");
        }
        continue;
      }
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            this.pushTypeVariable(decl.name);
          } else {
            throw new UnsupportedSyntaxError(decl, "non-Identifier name not supported");
          }
        }
        continue;
      }
      if (ts.isExportDeclaration(stmt)) {
        // noop
      } else {
        throw new UnsupportedSyntaxError(stmt, "namespace child (hoisting) not supported yet");
      }
    }

    // and then walk all the children like normal…
    for (const stmt of statements) {
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (decl.type) {
            this.convertTypeNode(decl.type);
          }
        }
        continue;
      }
      if (ts.isFunctionDeclaration(stmt)) {
        this.convertParametersAndType(stmt);
        continue;
      }
      if (ts.isInterfaceDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
        const typeVariables = this.convertTypeParameters(stmt.typeParameters);
        this.convertHeritageClauses(stmt);
        this.convertMembers(stmt.members);
        this.popScope(typeVariables);
        continue;
      }
      if (ts.isTypeAliasDeclaration(stmt)) {
        const typeVariables = this.convertTypeParameters(stmt.typeParameters);
        this.convertTypeNode(stmt.type);
        this.popScope(typeVariables);
        continue;
      }
      if (ts.isModuleDeclaration(stmt)) {
        this.convertNamespace(stmt, relaxedModuleBlock);
        continue;
      }
      if (ts.isEnumDeclaration(stmt)) {
        // noop
        continue;
      }
      if (ts.isExportDeclaration(stmt)) {
        if (stmt.exportClause) {
          if (ts.isNamespaceExport(stmt.exportClause)) {
            throw new UnsupportedSyntaxError(stmt.exportClause);
          }
          for (const decl of stmt.exportClause.elements) {
            const id = decl.propertyName || decl.name;
            this.pushIdentifierReference(id);
          }
        }
      } else {
        throw new UnsupportedSyntaxError(stmt, "namespace child (walking) not supported yet");
      }
    }

    this.popScope();
  }
}
