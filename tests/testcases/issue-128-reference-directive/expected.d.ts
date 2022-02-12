// >main-a<.d.ts
/// <reference types="jest" />
/// <reference types="react" />
export { B } from './common.d-8a60ff90.js';
declare const A = 2;
declare type JSXElements = keyof JSX.IntrinsicElements;
declare const a: JSXElements[];
export { A, JSXElements, a };
// >main-b<.d.ts
export { B } from './common.d-8a60ff90.js';
// common.d-8a60ff90.d.ts
/// <reference types="node" />
interface B {}
export { B };
