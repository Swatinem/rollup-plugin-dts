interface A {}
interface B {}
interface C {}
declare type Foo = A extends B ? C : never;
export type { Foo };
