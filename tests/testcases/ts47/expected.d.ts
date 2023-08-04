interface Hammer {}
type FirstHammer<T> = T extends [infer H extends Hammer, ...unknown[]] ? H : never;
interface State<in out T> {
  get: () => T;
  set: (value: T) => void;
}
export type { FirstHammer, State };
