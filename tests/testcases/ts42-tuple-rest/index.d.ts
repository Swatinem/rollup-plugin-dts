interface Leading {}
interface Middle {}

export type UsesLeading = [...Array<Leading>, number];
export type UsesMiddle = [boolean, ...Array<Middle>, boolean];
