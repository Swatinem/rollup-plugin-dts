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
  createIIFE,
} from "./astHelpers";
import { Transformer } from "./Transformer";
import { UnsupportedSyntaxError } from "./errors";

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
]);

interface DeclarationScopeOptions {
  id?: ts.Identifier;
  range: Ranged;
  transformer: Transformer;
}

export class DeclarationScope {
  // TODO: having this circular dependency is very unclean… figure out a way
  // to avoid it for the usecase of inline imports
  transformer: Transformer;

  declaration: ESTree.FunctionDeclaration;
  iife?: ESTree.ExpressionStatement;

  constructor({ id, range, transformer }: DeclarationScopeOptions) {
    this.transformer = transformer;
    if (id) {
      this.declaration = createDeclaration(id, range);
    } else {
      const { iife, fn } = createIIFE(range);
      this.iife = iife;
      this.declaration = fn as any;
    }
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

  /**
   * This will fix up the modifiers of a declaration.
   * We want to remove `export (default)?` modifiers, and in that case add a
   * missing `declare`. All the others should be untouched.
   */
  fixModifiers(node: ts.Node) {
    if (!node.modifiers) {
      return;
    }
    const modifiers: Array<string> = [];
    let hasDeclare = false;
    let start = Infinity;
    let end = 0;
    for (const mod of node.modifiers) {
      if (mod.kind !== ts.SyntaxKind.ExportKeyword && mod.kind !== ts.SyntaxKind.DefaultKeyword) {
        modifiers.push(mod.getText());
      }
      if (mod.kind === ts.SyntaxKind.DeclareKeyword) {
        hasDeclare = true;
      }
      start = Math.min(start, mod.getStart());
      end = Math.max(end, mod.getEnd());
    }

    // function and class *must* have a `declare` modifier
    if (!hasDeclare && (ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node))) {
      modifiers.unshift("declare");
    }

    const newModifiers = modifiers.join(" ");
    if (!newModifiers && end) {
      end += 1;
    }
    const original = this.transformer.sourceFile.text.slice(start, end);
    const middle = start + newModifiers.length;

    this.pushRaw(removeNested({ start: middle, end }));

    if (newModifiers) {
      this.transformer.fixups.push({
        original,
        replaceWith: newModifiers,
        range: { start, end: middle },
      });
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

  convertPropertyAccess(node: ts.PropertyAccessExpression): ESTree.Expression {
    // hm, we only care about property access expressions here…

    if (ts.isIdentifier(node.expression)) {
      return createIdentifier(node.expression);
    }

    if (ts.isPropertyAccessExpression(node.expression)) {
      return withStartEnd(
        {
          type: "MemberExpression",
          computed: false,
          object: this.convertPropertyAccess(node.expression),
          property: createIdentifier(node.name),
        },
        // TODO: clean up all the `start` handling!
        { start: node.getStart(), end: node.end },
      );
    }

    throw new UnsupportedSyntaxError(node.expression);
  }

  convertComputedPropertyName(node: { name?: ts.PropertyName }) {
    if (!node.name || !ts.isComputedPropertyName(node.name)) {
      return;
    }
    const { expression } = node.name;

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
        for (const arg of type.typeArguments || []) {
          this.convertTypeNode(arg);
        }
      }
    }
  }

  convertMembers(members: ts.NodeArray<ts.TypeElement | ts.ClassElement>) {
    for (const node of members) {
      if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node) || ts.isIndexSignatureDeclaration(node)) {
        this.convertComputedPropertyName(node);
        this.convertTypeNode(node.type);
        continue;
      }
      // istanbul ignore else
      if (
        ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isConstructorDeclaration(node) ||
        ts.isConstructSignatureDeclaration(node) ||
        ts.isCallSignatureDeclaration(node)
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
    if (ts.isImportTypeNode(node)) {
      this.convertImportTypeNode(node);
      return;
    }
    if (ts.isTypeQueryNode(node)) {
      this.pushReference(this.convertEntityName(node.exprName));
      return;
    }
    // istanbul ignore else
    if (ts.isInferTypeNode(node)) {
      this.pushTypeVariable(node.typeParameter.name);
      return;
    } else {
      throw new UnsupportedSyntaxError(node);
    }
  }

  // For import type nodes of the form
  // `import("./foo").Bar`
  // we create the following ESTree equivalent:
  // 1. `import * as _ from "./foo";` on the toplevel
  // 2. `_.Bar` in our declaration scope
  convertImportTypeNode(node: ts.ImportTypeNode) {
    // istanbul ignore if
    if (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)) {
      throw new UnsupportedSyntaxError(node, "inline imports should have a literal argument");
    }
    const fileId = node.argument.literal.text;
    const start = node.getStart() + (node.isTypeOf ? "typeof ".length : 0);
    const range = { start, end: node.getEnd() };
    const importId = this.transformer.addFixupLocation(range);
    const importIdRef = withStartEnd(
      {
        type: "Identifier",
        name: importId,
      },
      range,
    );
    this.transformer.pushStatement({
      type: "ImportDeclaration",
      specifiers: [
        {
          type: "ImportNamespaceSpecifier",
          local: { type: "Identifier", name: importId },
        },
      ],
      source: { type: "Literal", value: fileId },
    });
    if (node.qualifier && ts.isIdentifier(node.qualifier)) {
      this.pushReference(
        withStartEnd(
          {
            type: "MemberExpression",
            computed: false,
            object: importIdRef,
            property: createIdentifier(node.qualifier),
          },
          range,
        ),
      );
    } else {
      // we definitely need to do some string manipulation on the source code,
      // since rollup will not touch the `import("...")` bit at all.
      // also, for *internal* namespace references, we have the same problem
      // as with re-exporting references… -_-
      this.pushReference(importIdRef);
    }
  }

  convertNamespace(node: ts.ModuleDeclaration) {
    this.pushScope();

    // istanbul ignore if
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
        // istanbul ignore else
        if (stmt.name && ts.isIdentifier(stmt.name)) {
          this.pushTypeVariable(stmt.name);
        } else {
          throw new UnsupportedSyntaxError(stmt, `non-Identifier name not supported`);
        }
        continue;
      }
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          // istanbul ignore else
          if (ts.isIdentifier(decl.name)) {
            this.pushTypeVariable(decl.name);
          } else {
            throw new UnsupportedSyntaxError(decl, `non-Identifier name not supported`);
          }
        }
        continue;
      }
      // istanbul ignore else
      if (ts.isExportDeclaration(stmt)) {
        // noop
      } else {
        throw new UnsupportedSyntaxError(stmt, `namespace child (hoisting) not supported yet`);
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
        this.convertNamespace(stmt);
        continue;
      }
      if (ts.isEnumDeclaration(stmt)) {
        // noop
        continue;
      }
      // istanbul ignore else
      if (ts.isExportDeclaration(stmt)) {
        if (stmt.exportClause) {
          for (const decl of stmt.exportClause.elements) {
            const id = decl.propertyName || decl.name;
            this.pushIdentifierReference(id);
          }
        }
      } else {
        throw new UnsupportedSyntaxError(stmt, `namespace child (walking) not supported yet`);
      }
    }

    this.popScope();
  }
}
