interface I {
  (arg: string): string;
  staticProp: string;
}
declare const fn: {
  (arg: string): string;
  staticProp: string;
};
export { fn };
export type { I };
