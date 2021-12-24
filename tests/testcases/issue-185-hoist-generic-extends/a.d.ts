export declare type Props = Record<string, number>;
export declare class System<T extends Props> {
  _obj: T;
  constructor(src: T);
}
