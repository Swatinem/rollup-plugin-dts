declare namespace Foo {
  export type Bar = "hello, world";
}
declare namespace Bar {
  export import fb = Foo.Bar;
}
export import bfb = Bar.fb;
export { Bar, Foo };
