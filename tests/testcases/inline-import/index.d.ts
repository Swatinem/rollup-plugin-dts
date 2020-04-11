export interface Foo {
  bar: import("./bar").Bar;
  baz: typeof import("./bar").Baz;
}
