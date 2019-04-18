import * as ts from "typescript";
import * as ESTree from "estree";
import {
  Ranged,
  createExport,
  createIdentifier,
  createProgram,
  withStartEnd,
  createDefaultExport,
  matchesModifier,
  convertExpression,
  isInternal,
} from "./astHelpers";
import { DeclarationScope } from "./DeclarationScope";

type ESTreeImports = ESTree.ImportDeclaration["specifiers"];

interface Fixup {
  identifier: string;
  original: string;
  range: {
    start: number;
    end: number;
  };
}

export class Transformer {
  ast: ESTree.Program;
  fixups: Array<Fixup> = [];

  exports = new Set<string>();

  constructor(private sourceFile: ts.SourceFile) {
    this.ast = createProgram(sourceFile);
    for (const stmt of sourceFile.statements) {
      this.convertStatement(stmt);
    }
  }

  transform(): { ast: ESTree.Program; fixups: Array<Fixup> } {
    return { ast: this.ast, fixups: this.fixups };
  }

  addFixupLocation(range: { start: number; end: number }) {
    const identifier = `ಠ_dts_${this.fixups.length}`;
    this.fixups.push({
      identifier,
      original: this.sourceFile.text.slice(range.start, range.end),
      range,
    });
    return identifier;
  }

  pushStatement(node: ESTree.Statement | ESTree.ModuleDeclaration) {
    this.ast.body.push(node);
  }

  maybeMarkAsExported(node: ts.Node, id: ts.Identifier) {
    if (isInternal(node)) {
      return false;
    }
    if (matchesModifier(node as any, ts.ModifierFlags.ExportDefault)) {
      const start = node.pos;
      this.pushStatement(createDefaultExport(id, { start, end: start }));
      return true;
    } else if (matchesModifier(node as any, ts.ModifierFlags.Export)) {
      const start = node.pos;
      const name = id.getText();
      if (this.exports.has(name)) {
        return true;
      }
      this.pushStatement(createExport(id, { start, end: start }));
      this.exports.add(name);
      return true;
    }
    return false;
  }

  createDeclaration(id: ts.Identifier, range: Ranged) {
    const scope = new DeclarationScope({ id, range, transformer: this });
    this.pushStatement(scope.declaration);
    return scope;
  }

  convertStatement(node: ts.Node) {
    if (ts.isEnumDeclaration(node)) {
      return this.convertEnumDeclaration(node);
    }
    if (ts.isFunctionDeclaration(node)) {
      return this.convertFunctionDeclaration(node);
    }
    if (ts.isInterfaceDeclaration(node) || ts.isClassDeclaration(node)) {
      return this.convertClassOrInterfaceDeclaration(node);
    }
    if (ts.isTypeAliasDeclaration(node)) {
      return this.convertTypeAliasDeclaration(node);
    }
    if (ts.isVariableStatement(node)) {
      return this.convertVariableStatement(node);
    }
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      return this.convertExportDeclaration(node);
    }
    if (ts.isModuleDeclaration(node)) {
      return this.convertNamespaceDeclaration(node);
    }
    // istanbul ignore else
    if (ts.isImportDeclaration(node)) {
      return this.convertImportDeclaration(node);
    } else {
      console.log({ kind: node.kind, code: node.getFullText() });
      throw new Error(`unsupported node type`);
    }
  }

  convertNamespaceDeclaration(node: ts.ModuleDeclaration) {
    // istanbul ignore if
    if (!ts.isIdentifier(node.name)) {
      console.log({ code: node.getFullText() });
      throw new Error(`namespace name should be an "Identifier"`);
    }
    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node.name, node);
    scope.removeModifier(node);

    scope.pushIdentifierReference(node.name);

    scope.convertNamespace(node);
  }

  convertEnumDeclaration(node: ts.EnumDeclaration) {
    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node.name, node);
    scope.removeModifier(node);

    scope.pushIdentifierReference(node.name);
  }

  convertFunctionDeclaration(node: ts.FunctionDeclaration) {
    // istanbul ignore if
    if (!node.name) {
      console.log({ code: node.getFullText() });
      throw new Error(`FunctionDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node.name, node);
    scope.removeModifier(node);

    scope.pushIdentifierReference(node.name);

    scope.convertParametersAndType(node);
  }

  convertClassOrInterfaceDeclaration(node: ts.ClassDeclaration | ts.InterfaceDeclaration) {
    // istanbul ignore if
    if (!node.name) {
      console.log({ code: node.getFullText() });
      throw new Error(`ClassDeclaration / InterfaceDeclaration should have a name`);
    }

    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node.name, node);
    scope.removeModifier(node);
    if (ts.isInterfaceDeclaration(node)) {
      scope.removeModifier(node, ts.SyntaxKind.DefaultKeyword);
    }

    const typeVariables = scope.convertTypeParameters(node.typeParameters);
    scope.convertHeritageClauses(node);
    scope.convertMembers(node.members);
    scope.popScope(typeVariables);
  }

  convertTypeAliasDeclaration(node: ts.TypeAliasDeclaration) {
    this.maybeMarkAsExported(node, node.name);

    const scope = this.createDeclaration(node.name, node);
    scope.removeModifier(node);

    const typeVariables = scope.convertTypeParameters(node.typeParameters);
    scope.convertTypeNode(node.type);
    scope.popScope(typeVariables);
  }

  convertVariableStatement(node: ts.VariableStatement) {
    const { declarations } = node.declarationList;
    // istanbul ignore if
    if (declarations.length !== 1) {
      console.log({ code: node.getFullText() });
      throw new Error(`VariableStatement with more than one declaration not yet supported`);
    }
    for (const decl of declarations) {
      // istanbul ignore if
      if (!ts.isIdentifier(decl.name)) {
        console.log({ code: node.getFullText() });
        throw new Error(`VariableDeclaration must have a name`);
      }

      this.maybeMarkAsExported(node, decl.name);

      const scope = this.createDeclaration(decl.name, node);
      scope.removeModifier(node);

      scope.convertTypeNode(decl.type);
    }
  }

  convertExportDeclaration(node: ts.ExportDeclaration | ts.ExportAssignment) {
    if (ts.isExportAssignment(node)) {
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportDefaultDeclaration",
            declaration: convertExpression(node.expression),
          },
          node,
        ),
      );
      return;
    }

    const source = node.moduleSpecifier ? (convertExpression(node.moduleSpecifier) as any) : undefined;

    if (!node.exportClause) {
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportAllDeclaration",
            source,
          },
          node,
        ),
      );
    } else {
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportNamedDeclaration",
            declaration: null,
            specifiers: node.exportClause
              ? node.exportClause.elements.map(e => this.convertExportSpecifier(e))
              : /* istanbul ignore next */ [],
            source,
          },
          node,
        ),
      );
    }
  }

  convertImportDeclaration(node: ts.ImportDeclaration) {
    const source = convertExpression(node.moduleSpecifier) as any;
    if (!node.importClause) {
      return;
    }
    // istanbul ignore if
    if (!node.importClause.name && !node.importClause.namedBindings) {
      console.log({ code: node.getFullText() });
      throw new Error(`ImportDeclaration should have imports`);
    }
    const specifiers: ESTreeImports = node.importClause.namedBindings
      ? this.convertNamedImportBindings(node.importClause.namedBindings)
      : [];
    if (node.importClause.name) {
      specifiers.push({
        type: "ImportDefaultSpecifier",
        local: createIdentifier(node.importClause.name),
      });
    }

    this.pushStatement(
      withStartEnd(
        {
          type: "ImportDeclaration",
          specifiers,
          source,
        },
        node,
      ),
    );
  }

  convertNamedImportBindings(node: ts.NamedImportBindings): ESTreeImports {
    if (ts.isNamedImports(node)) {
      return node.elements.map(el => {
        const local = createIdentifier(el.name);
        const imported = el.propertyName ? createIdentifier(el.propertyName) : local;
        return {
          type: "ImportSpecifier",
          local,
          imported,
        } as ESTree.ImportSpecifier;
      });
    }
    return [
      {
        type: "ImportNamespaceSpecifier",
        local: createIdentifier(node.name),
      },
    ];
  }

  convertExportSpecifier(node: ts.ExportSpecifier): ESTree.ExportSpecifier {
    const exported = createIdentifier(node.name);
    return {
      type: "ExportSpecifier",
      exported: exported,
      local: node.propertyName ? createIdentifier(node.propertyName) : exported,
    };
  }
}
