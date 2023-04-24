export namespace Foo {
  export type Bar = "hello, world";
}

export namespace Bar {
  export import fb = Foo.Bar;
}

export import bfb = Bar.fb;
