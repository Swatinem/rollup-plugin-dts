// foo.d.ts
interface Foo {
  foo: string;
}
export type { Foo };
// bar.d.ts
interface FooBar {
  foobar: string;
}
declare module "./bar" {
  interface FooBar {
    foobar2: string;
  }
}
interface Baz {
  baz: string;
}
declare module "./bar" {
  interface Bar {
    bar2: string;
  }
}
declare module "./foo" {
  interface Foo {
    foo2: string;
  }
}
interface Bar {
  bar: string;
}
export type { Bar, Baz, FooBar };
// foobaz/index.d.ts
declare module "../foo" {
  interface Foo {
    foobaz: string;
  }
}
