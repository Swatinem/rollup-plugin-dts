import * as ts from "typescript";
import { UnsupportedSyntaxError } from "./errors";

interface Export {
  exportedName: string;
  localName: string;
}
interface Namespace {
  name: string;
  exports: Array<Export>;
  location: { start: number; end: number };
}

export class NamespaceFixer {
  constructor(private sourceFile: ts.SourceFile) {}

  findNamespaces() {
    const namespaces: Array<Namespace> = [];
    const itemTypes: { [key: string]: string } = {};

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
      // statements, obviously. But rollup uses full filenames with extension,
      // which typescript does not like. So make sure to remove those here.
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        let { text } = node.moduleSpecifier;
        if (text.startsWith(".") && text.endsWith(".d.ts")) {
          let end = node.moduleSpecifier.getEnd() - 1; // -1 to account for the quote
          namespaces.unshift({
            name: "",
            exports: [],
            location: {
              start: end - 5,
              end,
            },
          });
        }
      }

      if (ts.isClassDeclaration(node)) {
        itemTypes[node.name!.getText()] = "class";
      } else if (ts.isFunctionDeclaration(node)) {
        itemTypes[node.name!.getText()] = "function";
      } else if (ts.isInterfaceDeclaration(node)) {
        itemTypes[node.name.getText()] = "interface";
      } else if (ts.isTypeAliasDeclaration(node)) {
        itemTypes[node.name.getText()] = "type";
      } else if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
        itemTypes[node.name.getText()] = "namespace";
      } else if (ts.isEnumDeclaration(node)) {
        itemTypes[node.name.getText()] = "enum";
      }
      if (!ts.isVariableStatement(node)) {
        continue;
      }
      const { declarations } = node.declarationList;
      if (declarations.length !== 1) {
        continue;
      }
      const decl = declarations[0];
      const name = decl.name.getText();
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) {
        itemTypes[name] = "var";
        continue;
      }
      const obj = decl.initializer.arguments[0];
      if (
        !decl.initializer.expression.getFullText().includes("/*#__PURE__*/Object.freeze") ||
        !ts.isObjectLiteralExpression(obj)
      ) {
        continue;
      }
      const exports: Array<Export> = [];
      for (const prop of obj.properties) {
        if (
          !ts.isPropertyAssignment(prop) ||
          !ts.isIdentifier(prop.name) ||
          (prop.name.text !== "__proto__" && !ts.isIdentifier(prop.initializer))
        ) {
          throw new UnsupportedSyntaxError(prop, "Expected a property assignment");
        }
        if (prop.name.text === "__proto__") {
          continue;
        }
        exports.push({
          exportedName: prop.name.getText(),
          localName: prop.initializer.getText(),
        });
      }

      // sort in reverse order, since we will do string manipulation
      namespaces.unshift({
        name,
        exports,
        location,
      });
    }
    return { namespaces, itemTypes };
  }

  public fix() {
    let code = this.sourceFile.getFullText();

    const { namespaces, itemTypes } = this.findNamespaces();

    for (const ns of namespaces) {
      const codeAfter = code.slice(ns.location.end);
      code = code.slice(0, ns.location.start);

      for (const { exportedName, localName } of ns.exports) {
        if (exportedName === localName) {
          const type = itemTypes[localName];
          if (type === "interface" || type === "type") {
            // an interface is just a type
            code += `type ${ns.name}_${exportedName} = ${localName};\n`;
          } else if (type === "enum" || type === "class") {
            // enums and classes are both types and values
            code += `type ${ns.name}_${exportedName} = ${localName};\n`;
            code += `declare const ${ns.name}_${exportedName}: typeof ${localName};\n`;
          } else {
            // functions and vars are just values
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

      code += codeAfter;
    }

    return code;
  }
}
