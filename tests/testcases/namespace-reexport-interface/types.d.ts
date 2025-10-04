// Source namespace with interface and nested namespace
export namespace ArrayObjectStore {
  export interface Data {
    id: string;
    value: number;
  }

  export namespace Util {
    export function helper(): void;
  }
}
