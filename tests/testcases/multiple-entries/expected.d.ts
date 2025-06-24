// >main-a<.d.ts
interface A {}
interface B {}
export type { A, B };
// >main-b<.d.ts
export { B } from './>main-a<.js';
