// index.d.ts
interface A {}
interface B {}
interface I {}
export type { A, B, I };
// entry-a.d.ts
export { A } from './index.js';
// entry-b.d.ts
export { B } from './index.js';
