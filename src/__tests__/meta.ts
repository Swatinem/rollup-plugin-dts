export interface Meta {
  skip: boolean;
}
export type PartialMeta = Partial<Meta>;

export function defaultMeta(): Meta {
  return {
    skip: false,
  };
}
