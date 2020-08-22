type Strings = [string, string];
type Numbers = [number, number];
export type StrStrNumNumBool = [...Strings, ...Numbers, boolean];

type Arr = readonly any[];
export function concat<T extends Arr, U extends Arr>(arr1: T, arr2: U): [...T, ...U];
