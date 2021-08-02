interface MemberTypes {}
interface TypeInfo {}
declare abstract class MemberInfo {
  abstract readonly name: string;
  abstract readonly declaringType: TypeInfo;
  abstract readonly memberType: MemberTypes;
}
export { MemberInfo as default };
