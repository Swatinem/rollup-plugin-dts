declare type In = { a: string };
declare type Out = { b: number };
declare const config: {
  normalize: (inVar: In) => Out;
};
declare const options: {
  normalize: (inVar: In) => Out;
};
declare const params: {
  normalize: (inVar: In) => Out;
};
export { type In, type Out, config, options, params };
