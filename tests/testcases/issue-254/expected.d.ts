declare enum E {}
interface Foo {
  e: E;
}
declare namespace Bar {
  export enum F {}
}
export { Bar };
export type { Foo };
