interface TargetType {
  version: 'v2';
}
declare namespace Outer {
  namespace Inner {
    type ShadowedType = TargetType;
    export type Result = ShadowedType;
  }
}
export { Outer };
