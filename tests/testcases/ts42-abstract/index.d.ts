interface AbstractReturnValue {}
interface AbstractMember {}

declare abstract class AbstractClass {
  abstract someMethod(): AbstractReturnValue;
  badda(): void;
  member: AbstractMember;
}

export type AbstractConstructor<T extends AbstractClass> = abstract new (...args: any[]) => T;
