declare let name: string;
declare let age: number;
declare const export_default: {
  name: typeof name;
  age: typeof age;
};
export { age, export_default as foo, name };
