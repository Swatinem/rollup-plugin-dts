export interface Foo {
  ns1: import("foo");
  ns2: typeof import("foo");
}
