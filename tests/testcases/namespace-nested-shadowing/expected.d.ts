interface TargetType {
  version: 'v2';
}
declare namespace Outer {
  export namespace Inner {
    // Import shadows outer interface, verifies scoping and tree-shaking
    import ShadowedType = TargetType;
    export type Result = ShadowedType;
  }
}
export { Outer };
