interface SimpleInterface {}
type ObjectWithParam<ParamObj> = {
  [Prop in keyof ParamObj]?: any;
};
declare class CalendarDataManager {
  emitter: ObjectWithParam<SimpleInterface>;
}
export { CalendarDataManager };
