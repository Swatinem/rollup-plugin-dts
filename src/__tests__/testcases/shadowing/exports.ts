export interface A {}
export interface B {}
export interface C {}
export interface D {}
export interface E {}
export interface F {}
export interface G {}
export interface H {}
export interface I {}
export interface J {}
export interface K {}
export interface L {}

export class GenericKlass<A = any, B = A> {
  a: A;
  b: B;
}

export interface GenericInterface<C = any, D = C> {
  c: C;
  d: D;
}

export function genericFunction<E = any, F = E>(e: E): F {
  return;
}

export type ConditionalInfer<G> = G extends Array<Array<infer H>> ? H : never;

export type Mapped<I> = { [J in keyof I]: I[J] };

export type GenericType<K = any, L = K> = {
  k: K;
  l: L;
};
