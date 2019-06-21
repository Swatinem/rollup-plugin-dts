declare function autobind(): ClassDecorator | MethodDecorator;
declare function autobind(constructor: Function): void;
declare function autobind(prototype: Object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
declare function autobind$1(): ClassDecorator | MethodDecorator;
declare function autobind$1(constructor: Function): void;
declare function autobind$1(prototype: Object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
export { autobind as A, autobind$1 as B };
