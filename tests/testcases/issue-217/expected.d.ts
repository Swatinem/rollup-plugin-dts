interface Example<S extends string> {
  example: S;
}
declare const dog: Example<"hi">;
type example_d_Example<S extends string> = Example<S>;
declare const example_d_dog: typeof dog;
declare namespace example_d {
  export {
    example_d_Example as Example,
    example_d_dog as dog,
  };
}
export { example_d as types };
