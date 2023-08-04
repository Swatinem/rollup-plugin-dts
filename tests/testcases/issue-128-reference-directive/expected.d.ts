// >main-a<.d.ts
/// <reference types="jest" />
/// <reference types="react" />
export { B } from './>main-b<.js';
declare const A = 2;
declare type JSXElements = keyof JSX.IntrinsicElements;
declare const a: JSXElements[];
export { A, type JSXElements, a };
// >main-b<.d.ts
/// <reference types="node" />
interface B {}
export type { B };
