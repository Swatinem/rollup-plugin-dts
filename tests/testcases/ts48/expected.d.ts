type MyNum = number;
type SomeNum = "100" extends `${infer U extends MyNum}` ? U : never;
export type { SomeNum };
