interface A {}
interface B {}
interface C {}
interface D {}
interface E {}
interface F {}
interface G {}
interface H {}
interface I {}
interface J {}
interface K {}
interface L {}
interface M {}
interface N {}
interface O {}
interface P {}
export declare function parenthesized(a: A): B;
export declare function union(a: C | D): E | F;
export declare function intersection(a: G & H): I & J;
export declare function operator(a: keyof K): void;
export declare function arrayAndTuple(a: [L, M]): N[];
export declare function predicate(a: any): a is O;
export declare function assertion(a: any): asserts a is P;
