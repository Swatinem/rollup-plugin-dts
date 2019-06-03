interface A {}
interface B {}

export type Foo = { [P in keyof A]: B[P] };
