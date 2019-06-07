import { ElementType, ForwardRefExoticComponent, ComponentPropsWithRef } from 'react';
type AnimatedProps<T> = T;
type AnimatedComponent<T extends ElementType> = ForwardRefExoticComponent<
  AnimatedProps<ComponentPropsWithRef<T>>
>;
export { AnimatedComponent, AnimatedProps };
