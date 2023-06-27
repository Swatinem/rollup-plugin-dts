interface Hammer {}

export type FirstHammer<T> = T extends [infer H extends Hammer, ...unknown[]] ? H : never;

export interface State<in out T> {
  get: () => T;
  set: (value: T) => void;
}
