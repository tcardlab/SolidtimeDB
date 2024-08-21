import type { ReducerClass, DatabaseTableClass} from "@clockworklabs/spacetimedb-sdk";
import { SpacetimeDBClient, Reducer, DatabaseTable } from "@clockworklabs/spacetimedb-sdk";

export function registerArr(arr: Array<ReducerClass|DatabaseTableClass>) {
  for( let STDB_Comp of arr) {
    if (STDB_Comp.prototype instanceof Reducer) {
      SpacetimeDBClient.registerReducers(STDB_Comp as ReducerClass)
      continue
    } 
    if (STDB_Comp.prototype instanceof DatabaseTable) {
      SpacetimeDBClient.registerTables(STDB_Comp as DatabaseTableClass)
      continue
    }
  }
}

export function registerObj(Obj:Record<string, ReducerClass|DatabaseTableClass>) {
  registerArr(Object.values(Obj))
}

import * as All from '@/module_bindings'
export function registerAll() {
  registerObj({...All as any})
}
// Auto run
registerAll()