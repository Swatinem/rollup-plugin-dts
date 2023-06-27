import { HideT, ShowT, SomeComponent } from "./foo";

export class SpecializedComponent extends SomeComponent {
  override show(): ShowT;
  override hide(): HideT;
}
