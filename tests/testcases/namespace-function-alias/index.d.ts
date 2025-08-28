export declare function myFunc(arg: string): void;

// Augment the function with a namespace
export declare namespace myFunc {
  // Create an alias to the outer function for re-exporting as default
  import _default = myFunc;
  export { _default as default };

  export const SOME_PROP = 123;
}
