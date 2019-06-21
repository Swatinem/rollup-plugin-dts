export default function autobind(): ClassDecorator | MethodDecorator;
export default function autobind(constructor: Function): void;
export default function autobind(prototype: Object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
