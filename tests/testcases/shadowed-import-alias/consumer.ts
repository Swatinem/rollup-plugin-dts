import { B, f, type I, type Klass } from "lib";

declare const klass: Klass;
declare const i: I<number>;
export const x: string = B.b(klass).x;
export const y: string = f({ y: 1 }, klass).x;
export const z: string = i.b.x;
