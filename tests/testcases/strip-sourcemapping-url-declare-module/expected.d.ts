declare module "virtual:config" {
  export const config: {
    mode: string;
  };
}
declare const mode: string;
declare const currentMode: typeof mode;
export { currentMode };
