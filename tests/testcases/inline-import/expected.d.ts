interface Bar {}
declare const Baz = 123;
interface Foo {
  bar: Bar;
  baz: typeof Baz;
}
export type { Foo };
