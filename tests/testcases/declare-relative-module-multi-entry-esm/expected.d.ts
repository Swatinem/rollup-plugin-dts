// main-foo.d.ts
interface Foo {
  foo: string;
}
export type { Foo };
// main-bar.d.ts
interface FooBar {
  foobar: string;
}
declare module "./main-bar.js" {
  interface FooBar {
    foobar2: string;
  }
}
declare module "./main-bar.js" {
  interface Bar {
    bar2: string;
  }
}
interface FooBaz {
  foobaz: string;
}
declare module "./main-foo.js" {
  interface Foo {
    foo2: string;
  }
}
interface Bar {
  bar: string;
}
export type { Bar, FooBar, FooBaz };
// main-baz/index.d.ts
declare module "../main-foo.js" {
  interface Foo {
    baz: string;
  }
}
interface Baz {
  baz: string;
}
export type { Baz };
