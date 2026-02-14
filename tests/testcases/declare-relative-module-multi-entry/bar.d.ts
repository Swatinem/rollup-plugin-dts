export * from "./foobar";
export * from "./baz";

declare module "./foo" {
  interface Foo {
    foo2: string;
  }
}

export interface Bar {
  bar: string;
}
