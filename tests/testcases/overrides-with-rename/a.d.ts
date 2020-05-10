import b from "./b";

export default function autobind(): typeof b;
export function unused(): ClassDecorator | MethodDecorator;
export default function autobind(constructor: Function): void;
export function unused(constructor: Function): void;
export default function autobind(prototype: typeof b, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
export function unused(prototype: Object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
