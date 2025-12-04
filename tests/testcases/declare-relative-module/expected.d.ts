interface Foo {
  someProp: boolean;
}
declare module "./expected.d" {
  interface Foo {
    anotherProp: string;
  }
}
export type { Foo };
