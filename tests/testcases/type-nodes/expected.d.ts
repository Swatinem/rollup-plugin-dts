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
declare function parenthesized(a: A): B;
declare function union(a: C | D): E | F;
declare function intersection(a: G & H): I & J;
declare function operator(a: keyof K): void;
declare function arrayAndTuple(a: [L, M]): N[];
declare function predicate(a: any): a is O;
declare function assertion(a: any): asserts a is P;
export { arrayAndTuple, assertion, intersection, operator, parenthesized, predicate, union };
