export interface Foo {
  ns: typeof import("./bar");
}

declare const foo: Foo;
new foo.ns.Bar();
