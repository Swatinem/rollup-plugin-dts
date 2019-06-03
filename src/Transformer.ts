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
} from "./astHelpers";
import { DeclarationScope } from "./DeclarationScope";
import { UnsupportedSyntaxError /*, ReExportNamespaceError*/ } from "./errors";

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
  namespaceImports = new Map<string, ts.Node>();

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
    const original = this.sourceFile.text.slice(range.start, range.end);
    let identifier = `ɨmport${this.fixups.length}`;
    identifier += original.slice(identifier.length).replace(/[^a-zA-Z0-9_$]/g, () => "_");

    this.fixups.push({
      identifier,
      original,
      range,
    });
    return identifier;
  }

  pushStatement(node: ESTree.Statement | ESTree.ModuleDeclaration) {
    this.ast.body.push(node);
  }

  maybeMarkAsExported(node: ts.Node, id: ts.Identifier) {
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
      throw new UnsupportedSyntaxError(node);
    }
  }

  convertNamespaceDeclaration(node: ts.ModuleDeclaration) {
    // istanbul ignore if
    if (!ts.isIdentifier(node.name)) {
      throw new UnsupportedSyntaxError(node, `namespace name should be an "Identifier"`);
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
      throw new UnsupportedSyntaxError(node, `FunctionDeclaration should have a name`);
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
      throw new UnsupportedSyntaxError(node, `ClassDeclaration / InterfaceDeclaration should have a name`);
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
      throw new UnsupportedSyntaxError(node, `VariableStatement with more than one declaration not yet supported`);
    }
    for (const decl of declarations) {
      // istanbul ignore if
      if (!ts.isIdentifier(decl.name)) {
        throw new UnsupportedSyntaxError(node, `VariableDeclaration must have a name`);
      }

      this.maybeMarkAsExported(node, decl.name);

      const scope = this.createDeclaration(decl.name, node);
      scope.removeModifier(node);

      scope.convertTypeNode(decl.type);
    }
  }

  convertExportDeclaration(node: ts.ExportDeclaration | ts.ExportAssignment) {
    if (ts.isExportAssignment(node)) {
      const correspondingImport = this.namespaceImports.get(node.expression.getText().trim());
      if (correspondingImport) {
        // throw new ReExportNamespaceError([correspondingImport, node.expression]);
      }
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
      const specifiers = [];
      for (const elem of node.exportClause.elements) {
        const correspondingImport = this.namespaceImports.get(elem.getText().trim());
        if (correspondingImport) {
          // throw new ReExportNamespaceError([correspondingImport, elem]);
        }
        specifiers.push(this.convertExportSpecifier(elem));
      }
      this.pushStatement(
        withStartEnd(
          {
            type: "ExportNamedDeclaration",
            declaration: null,
            specifiers,
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
      throw new UnsupportedSyntaxError(node, `ImportDeclaration should have imports`);
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
    this.namespaceImports.set(node.name.getText().trim(), node);
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
