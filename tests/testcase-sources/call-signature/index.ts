export interface I {
  (arg: string): string;
  staticProp: string;
}
export const fn = (arg: string) => arg;
fn.staticProp = "static";
