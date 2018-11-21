interface A {
}
interface B {
}
interface C {
}
interface D {
}
interface E {
}
interface F {
}
interface G {
}
interface H {
}
interface I {
}
interface J {
}
interface K {
}
interface L {
}
interface M {
}
interface N {
}
declare function parenthesized(a: (A)): (B);
declare function union(a: C | D): E | F;
declare function intersection(a: G & H): I & J;
declare function operator(a: keyof K): void;
declare function arrayAndTuple(a: [L, M]): N[];
export { parenthesized, union, intersection, operator, arrayAndTuple };
