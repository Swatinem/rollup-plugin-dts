export type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

export type MyExclude<T, U> = T extends U ? never : T;
