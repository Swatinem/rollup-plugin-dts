declare function myFunc(arg: string): void;
// Augment the function with a namespace
declare namespace myFunc {
  // Local identifier alias (not qualified name) must preserve `import` keyword
  import _default = myFunc;
  export { _default as default };
  export const SOME_PROP = 123;
}
export { myFunc };
