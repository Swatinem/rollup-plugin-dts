export interface Foo {
  bar: import("./bar").Bar<number>;
}
