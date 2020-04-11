interface A {}
interface B {}
interface C {}
export declare type Foo = A extends B ? C : never;
export {};
