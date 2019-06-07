import { ElementType, ComponentPropsWithRef, ForwardRefExoticComponent } from "react";

export type AnimatedProps<T> = T;
export type AnimatedComponent<T extends ElementType> = ForwardRefExoticComponent<
  AnimatedProps<ComponentPropsWithRef<T>>
>;
