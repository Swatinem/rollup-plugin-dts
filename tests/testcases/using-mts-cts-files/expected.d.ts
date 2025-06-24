// mts.d.ts
interface A {
}
interface B {
}
export type { A, B };
// cts.d.ts
export { B } from './mts.js';
