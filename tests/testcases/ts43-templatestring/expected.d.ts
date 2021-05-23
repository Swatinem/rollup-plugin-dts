declare function foo<V extends string>(arg: `*${V}*`): V;
export { foo };
