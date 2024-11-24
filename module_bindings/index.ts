export { Message } from "./message.js"
export { SendMessageReducer } from "./send_message_reducer.js"
export { SetNameReducer } from "./set_name_reducer.js"
export { User } from "./user.js"

import type { ReducerClass, DatabaseTableClass} from "@clockworklabs/spacetimedb-sdk";
import { SpacetimeDBClient, Reducer, DatabaseTable } from "@clockworklabs/spacetimedb-sdk";
export function registerArr(arr: Array<ReducerClass|DatabaseTableClass>) {
  for( let STDB_Comp of arr) {
    if (STDB_Comp.prototype instanceof Reducer) {
      SpacetimeDBClient.registerReducers(STDB_Comp as ReducerClass);
      continue
    } 
    if (STDB_Comp.prototype instanceof DatabaseTable) {
      SpacetimeDBClient.registerTables(STDB_Comp as DatabaseTableClass);
      continue
    }
  }
}

export async function register() {
  let All = await import('./index.js')
  registerArr(Object.values({...All as any}))
}
