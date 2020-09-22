/**
 * @description @TODO
 */
declare function export_default<T extends object>(
  object: T,
  initializationObject: {
    [x in keyof T]: () => Promise<T[x]>;
  },
): Promise<void>;
export default export_default;
