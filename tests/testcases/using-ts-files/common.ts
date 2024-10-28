export interface A {}
export interface B {}
export interface unused {}
// The following code triggers `Unused '@ts-expect-error' directive` error,
// but it doesn't actually prevent the DTS from being emitted.
// @ts-expect-error
