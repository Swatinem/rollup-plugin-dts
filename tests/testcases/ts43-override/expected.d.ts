interface ShowT {}
interface HideT {}
declare class SomeComponent {
  show(): ShowT;
  hide(): HideT;
}
declare class SpecializedComponent extends SomeComponent {
  override show(): ShowT;
  override hide(): HideT;
}
export { SpecializedComponent };
