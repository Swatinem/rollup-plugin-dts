// a.d.ts
interface A {
}
interface B {
}
export type { A, B };
// b.d.ts
export { B } from './a.js';
