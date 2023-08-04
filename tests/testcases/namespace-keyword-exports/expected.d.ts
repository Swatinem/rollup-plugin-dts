declare const _in = "foo";
declare namespace foo_d {
  export { _in as in };
}
export { foo_d as foo };
