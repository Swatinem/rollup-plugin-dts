import * as Types from "./types";

// This interface should be tree-shaken away because it's never used.
interface ShadowedType {
  version: 'v1';
}

export namespace Outer {
  export namespace Inner {
    // Import shadows outer interface, verifies scoping and tree-shaking
    import ShadowedType = Types.TargetType;
    export type Result = ShadowedType;
  }
}
