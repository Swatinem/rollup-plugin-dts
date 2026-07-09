import type { FooA, FooB } from "lib/entry-a";
import "lib/entry-b";

declare const fooA: FooA;
declare const fooB: FooB;

export const a: string = fooA.a;
export const b: string = fooB.b;

// @ts-expect-error -- the kept "./foo-b" augmentation must not merge into the
// conflicting Foo from foo-a (the collateral-merge hazard of a naive rewrite)
export const collateral: number = fooA.extra;

// @ts-expect-error -- the kept "./foo-b" augmentation stays dormant
export const dormant: number = fooB.extra;
