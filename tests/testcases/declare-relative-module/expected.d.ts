interface Foo {
  someProp: boolean;
}
declare module "./index" {
  interface Foo {
    anotherProp: string;
  }
}
export type { Foo };
