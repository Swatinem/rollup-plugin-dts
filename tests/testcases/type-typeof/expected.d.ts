interface A {}
declare const a: A;
declare function typeQuery(): typeof a;
export { typeQuery };
