declare let name: string;
declare let age: number;
declare const export_default: {
  name: typeof name;
  age: typeof age;
};
declare const _exports: string[];
export { age, _exports as bar, export_default as foo, name };
