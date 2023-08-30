interface MyInterface {
  a: string;
}
declare namespace MyInterface {
  export const b: string;
}
export { MyInterface };
