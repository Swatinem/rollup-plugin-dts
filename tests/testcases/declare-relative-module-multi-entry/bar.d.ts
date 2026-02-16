export * from "./foobar";
export * from "./foobaz";

declare module "./foo" {
  interface Foo {
    foo2: string;
  }
}

export interface Bar {
  bar: string;
}
