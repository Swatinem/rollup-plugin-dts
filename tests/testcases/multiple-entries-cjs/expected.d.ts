// main-a.d.cts
interface A {}
interface B {}
export type { A, B };
// main-b.d.cts
export { B } from './main-a.cjs';
