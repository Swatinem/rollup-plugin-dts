interface A {}
interface B {}
interface C {}

export type Foo = A extends B ? C : never;
