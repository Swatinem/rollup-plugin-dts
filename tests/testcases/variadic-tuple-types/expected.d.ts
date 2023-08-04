type Strings = [string, string];
type Numbers = [number, number];
type StrStrNumNumBool = [...Strings, ...Numbers, boolean];
type Arr = readonly any[];
declare function concat<T extends Arr, U extends Arr>(arr1: T, arr2: U): [...T, ...U];
export { type StrStrNumNumBool, concat };
