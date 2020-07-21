export interface SimpleInterface {}

export type ObjectWithParam<ParamObj> = {
  [Prop in keyof ParamObj]?: any;
};
