export default function autobind(): ClassDecorator | MethodDecorator;
export default function autobind(constructor: Function): void;
export default function autobind(prototype: Object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;

export function unused(): ClassDecorator | MethodDecorator;
export function unused(constructor: Function): void;
export function unused(prototype: Object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
