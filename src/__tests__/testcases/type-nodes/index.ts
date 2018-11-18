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

// prettier-ignore
export function parenthesized(a: (A)): (B) {
  return a;
}
export function union(a: C | D): E | F {
  return a;
}
export function intersection(a: G & H): I & J {
  return a;
}
export function operator(a: keyof K) {
  throw a;
}
export function arrayAndTuple(a: [L, M]): N[] {
  return a;
}
