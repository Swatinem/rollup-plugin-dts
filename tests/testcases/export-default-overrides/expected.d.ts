declare function autobind(): ClassDecorator | MethodDecorator;
declare function autobind(constructor: Function): void;
declare function autobind(prototype: Object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
export { autobind as default };
