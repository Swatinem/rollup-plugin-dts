interface A {}
type foo_d_A = A;
declare namespace foo_d {
  export {
    foo_d_A as A,
  };
}
export { foo_d as foo };
