export interface A {}

/** No export, but can still be imported because of "global module" */
type B = any

declare var C: any
declare let D: any
declare const E: any

declare function F(): void

declare class G {}
declare enum H {}

declare namespace I {}

declare module 'J' {}
