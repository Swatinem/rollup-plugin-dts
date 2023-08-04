interface Leading {}
interface Middle {}
type UsesLeading = [...Array<Leading>, number];
type UsesMiddle = [boolean, ...Array<Middle>, boolean];
export type { UsesLeading, UsesMiddle };
