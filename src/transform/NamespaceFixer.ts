import ts from "typescript";
import { UnsupportedSyntaxError } from "./errors.js";

/**
 * The reason we need this here as a post-processing step is that rollup will
 * generate special objects for things like `export * as namespace`.
 * In the typescript world, the `namespace` constructs exists for this purpose.
 *
 * Now the problem is that we can’t just re-export things from a typescript
 * namespace right away, because of naming issues, `export { A as A }` is
 * trivially recursive inside the namespace. Therefore we create an alias
 * *outside* the namespace, and re-export that alias under the proper name,
 * something like `Alias_A = A; export { Alias_A as A }`.
 * And now we also have to take care that in typescript there is a difference
 * between types and values, and some constructs like `class` are actually both.
 *
 * Types get a `type` alias, and values get a `declare const` alias.
 * Names with a namespace meaning (namespaces and enums, plus anything merged
 * with them) get an `import Alias_A = A` alias, which keeps every meaning.
 * One name can have several declarations (e.g. `type A` and `const A`), so we
 * collect the meanings of all of them.
 */

interface Export {
  exportedName: string;
  localName: string;
}
interface Item {
  type?: boolean;
  value?: boolean;
  namespace?: boolean;
  generics?: ts.NodeArray<ts.TypeParameterDeclaration>;
}
interface Namespace {
  name: string;
  exports: Array<Export>;
  location: { start: number; end: number };
  textBeforeCodeAfter?: string;
}

export class NamespaceFixer {
  constructor(private sourceFile: ts.SourceFile) {}

  findNamespaces() {
    const namespaces: Array<Namespace> = [];
    const items: { [key: string]: Item } = {};
    // a name can be declared more than once (declaration merging), so merge the meanings
    const addItem = (name: string, item: Item) => {
      const prev = items[name];
      items[name] = {
        type: prev?.type || item.type,
        value: prev?.value || item.value,
        namespace: prev?.namespace || item.namespace,
        generics: prev?.generics?.length ? prev.generics : item.generics,
      };
    };

    for (const node of this.sourceFile.statements) {
      const location = {
        start: node.getStart(),
        end: node.getEnd(),
      };

      // Well, this is a big hack:
      // For some global `namespace` and `module` declarations, we generate
      // some fake IIFE code, so rollup can correctly scan its scope.
      // However, rollup will then insert bogus semicolons,
      // these `EmptyStatement`s, which are a syntax error and we want to
      // remove them. Well, we do that here…
      if (ts.isEmptyStatement(node)) {
        namespaces.unshift({
          name: "",
          exports: [],
          location,
        });
        continue;
      }
      // When generating multiple chunks, rollup links those via import
      // statements, obviously. But rollup uses full filenames with typescript extension,
      // which typescript does not like. So make sure to change those to javascript extension here.
      // `.d.ts` -> `.js`
      // `.d.cts` -> `.cjs`
      // `.d.mts` -> `.mjs`
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const { text } = node.moduleSpecifier;
        if (text.startsWith(".") && (text.endsWith(".d.ts") || text.endsWith(".d.cts") || text.endsWith(".d.mts"))) {
          const start = node.moduleSpecifier.getStart() + 1; // +1 to account for the quote
          const end = node.moduleSpecifier.getEnd() - 1; // -1 to account for the quote
          namespaces.unshift({
            name: "",
            exports: [],
            location: {
              start,
              end,
            },
            textBeforeCodeAfter: text
              .replace(/\.d\.ts$/, ".js")
              .replace(/\.d\.cts$/, ".cjs")
              .replace(/\.d\.mts$/, ".mjs"),
          });
        }
      }

      // Remove redundant `{ Foo as Foo }` exports from a namespace which we
      // added in pre-processing to fix up broken renaming
      if (ts.isModuleDeclaration(node) && node.body) {
        let body: ts.Node = node.body;
        // Traverse dotted namespace chain (e.g. `namespace A.B.C {}`)
        while (ts.isModuleDeclaration(body) && body.body) {
          body = body.body;
        }
        if (!ts.isModuleBlock(body)) {
          continue;
        }
        for (const stmt of body.statements) {
          if (ts.isExportDeclaration(stmt) && stmt.exportClause) {
            if (ts.isNamespaceExport(stmt.exportClause)) {
              continue;
            }
            for (const decl of stmt.exportClause.elements) {
              if (decl.propertyName && decl.propertyName.getText() == decl.name.getText()) {
                namespaces.unshift({
                  name: "",
                  exports: [],
                  location: {
                    start: decl.propertyName.getEnd(),
                    end: decl.name.getEnd(),
                  },
                });
              }
            }
          }
        }
      }

      if (ts.isClassDeclaration(node)) {
        addItem(node.name!.getText(), { type: true, value: true, generics: node.typeParameters });
      } else if (ts.isFunctionDeclaration(node)) {
        // a function has generics, but these don’t need to be specified explicitly,
        // since functions are treated as values.
        addItem(node.name!.getText(), { value: true });
      } else if (ts.isInterfaceDeclaration(node)) {
        addItem(node.name.getText(), { type: true, generics: node.typeParameters });
      } else if (ts.isTypeAliasDeclaration(node)) {
        addItem(node.name.getText(), { type: true, generics: node.typeParameters });
      } else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
        addItem(node.name.getText(), { namespace: true });
      } else if (ts.isEnumDeclaration(node)) {
        // an enum is a type, a value, and a namespace of its members
        addItem(node.name.getText(), { namespace: true });
      }
      if (!ts.isVariableStatement(node)) {
        continue;
      }
      const { declarations } = node.declarationList;
      if (declarations.length !== 1) {
        continue;
      }
      const decl = declarations[0]!;
      const name = decl.name.getText();
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) {
        addItem(name, { value: true });
        continue;
      }
      const obj = decl.initializer.arguments[0]!;
      if (
        !decl.initializer.expression.getFullText().includes("/*#__PURE__*/Object.freeze") ||
        !ts.isObjectLiteralExpression(obj)
      ) {
        continue;
      }
      const exports: Array<Export> = [];
      for (const prop of obj.properties) {
        // Rollup uses getters for namespace members involved in a cycle.
        const getterReturn = ts.isGetAccessorDeclaration(prop) && prop.body?.statements.length === 1
          ? prop.body.statements[0]
          : undefined;
        let initializer = ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
        if (getterReturn && ts.isReturnStatement(getterReturn)) {
          initializer = getterReturn.expression;
        }
        if (
          !prop.name ||
          !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) ||
          !initializer ||
          (prop.name.text !== "__proto__" && !ts.isIdentifier(initializer))
        ) {
          throw new UnsupportedSyntaxError(prop, "Expected a property assignment");
        }
        if (prop.name.text === "__proto__") {
          continue;
        }
        exports.push({
          exportedName: prop.name.text,
          localName: initializer.getText(),
        });
      }

      // sort in reverse order, since we will do string manipulation
      namespaces.unshift({
        name,
        exports,
        location,
      });
    }
    return { namespaces, itemTypes: items };
  }

  public fix() {
    let code = this.sourceFile.getFullText();

    const { namespaces, itemTypes } = this.findNamespaces();

    for (const ns of namespaces) {
      const codeAfter = code.slice(ns.location.end);
      code = code.slice(0, ns.location.start);

      for (const { exportedName, localName } of ns.exports) {
        if (exportedName === localName) {
          const item = itemTypes[localName];
          if (item?.namespace) {
            // namespaces and enums may contain both types and values,
            // and an `import` alias keeps all meanings of the name
            code += `import ${ns.name}_${exportedName} = ${localName};\n`;
            continue;
          }
          if (item?.type) {
            const typeParams = renderTypeParams(item.generics);
            code += `type ${ns.name}_${exportedName}${typeParams.in} = ${localName}${typeParams.out};\n`;
          }
          if (!item || item.value) {
            // classes, functions and vars are values
            code += `declare const ${ns.name}_${exportedName}: typeof ${localName};\n`;
          }
        }
      }
      if (ns.name) {
        code += `declare namespace ${ns.name} {\n`;
        code += `  export {\n`;
        for (const { exportedName, localName } of ns.exports) {
          if (exportedName === localName) {
            code += `    ${ns.name}_${exportedName} as ${exportedName},\n`;
          } else {
            code += `    ${localName} as ${exportedName},\n`;
          }
        }

        code += `  };\n`;
        code += `}`;
      }

      code += ns.textBeforeCodeAfter ?? "";
      code += codeAfter;
    }

    return code;
  }
}

function renderTypeParams(typeParameters?: ts.NodeArray<ts.TypeParameterDeclaration>) {
  if (!typeParameters || !typeParameters.length) {
    return { in: "", out: "" };
  }

  return {
    in: `<${typeParameters.map((param) => param.getText()).join(", ")}>`,
    out: `<${typeParameters.map((param) => param.name.getText()).join(", ")}>`,
  };
}
