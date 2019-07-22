/**
 * @public
 */
declare type In = { a: string };

/**
 * @public
 */
declare type Out = { b: number };
/**
 * @public
 */
declare const config: {
  normalize: (inVar: In) => Out;
};
/**
 * @public
 */
declare const options: {
  normalize: (inVar: In) => Out;
};
/**
 * @public
 */
declare const pararms: {
  normalize: (inVar: undefined) => undefined;
};
export { In, Out, config, options, params };
