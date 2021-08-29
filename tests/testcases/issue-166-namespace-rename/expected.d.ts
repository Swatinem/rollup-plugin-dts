declare const Item$1: () => void;
declare namespace A {
  export { Item$1 as Item };
}
declare const Item: () => void;
declare namespace B {
  export { Item };
}
export { A, B };
