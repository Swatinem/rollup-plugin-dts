// main-a.d.mts
interface A {}
interface B {}
export type { A, B };
// main-b.d.mts
export { B } from './main-a.mjs';
