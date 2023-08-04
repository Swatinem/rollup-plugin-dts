type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};
type MyExclude<T, U> = T extends U ? never : T;
interface Person {
  name: string;
  age: number;
  location: string;
}
type LazyPerson = Getters<Person>;
type RemoveKindField<T> = {
  [K in keyof T as MyExclude<K, "kind">]: T[K];
};
interface Circle {
  kind: "circle";
  radius: number;
}
type KindlessCircle = RemoveKindField<Circle>;
export type { KindlessCircle, LazyPerson };
