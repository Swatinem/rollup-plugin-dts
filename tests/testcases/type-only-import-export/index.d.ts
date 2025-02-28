import A from 'a'
import type D from 'd'

import { B } from 'b'
import { type E } from 'e'
import type { G1 } from 'g1'

import { B as B1 } from 'b1'
import { type E as E3 } from 'e'
import type { E as E4 } from 'e3'

import * as C from 'c'
import type * as F from 'f'

export { A, C, E3, E4, F, G1 }
export type { B }
export { type D }

export { C as C1 }
export type { B1 as B2 }
export type { B1 as B3 }
export { type E3 as E2 }

export default E

export { G } from 'g'
export type { J } from 'j'
export { type L } from 'l'

export { H as H1 } from 'h1'
export type { K as K1 } from 'k1'
export { type M as M1 } from 'm1'

export * from 'i1'
export type * from 'n'

export * as I from 'i'

interface O {}
export { O as O1 }
export type * as O from 'o'

declare class X {}
export type { X }

interface Foo {
  inline: string
}
export type { Foo as FooInlne }
export type { Foo } from './foo'

import type { BarType } from './bar'
import { BarValue } from './bar'
export { BarType, BarValue }
