declare function autobind$1(): typeof autobind;
declare function autobind$1(constructor: Function): void;
declare function autobind$1(prototype: typeof autobind, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
declare function autobind(): typeof autobind$1;
declare function autobind(constructor: Function): void;
declare function autobind(prototype: typeof autobind$1, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
export { autobind as A, autobind$1 as B };
