import MemberTypes from "./memberTypes";
import TypeInfo from "./typeInfo";

export default abstract class MemberInfo {
  abstract readonly name: string;
  abstract readonly declaringType: TypeInfo;
  abstract readonly memberType: MemberTypes;
}
