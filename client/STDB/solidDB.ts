/*
  NOTES: 
    - Solid 2.0 will deprecate createMutable... will have to add explicit readwrite separation
    - Should Update frontend to use .all() (as that prob the most expected use and is compat with OG STDB)
*/

// pkg imports
import { createSignal, batch, onCleanup } from 'solid-js'
import { createMutable, createStore, SetStoreFunction } from 'solid-js/store'
import type { ClientDB, ReducerEvent } from '@clockworklabs/spacetimedb-sdk'
import { ReactiveMap } from "@solid-primitives/map";
import { createLazyMemo } from "@solid-primitives/memo";
import { Table } from "@clockworklabs/spacetimedb-sdk/dist/table";


/***  HELPERS   ***/
type Red = ReducerEvent | undefined
class DBOp {
  public type: "insert" | "delete";
  public instance: any;
  public rowPk: string;

  constructor(type: "insert" | "delete", rowPk: string, instance: any) {
    this.type = type;
    this.rowPk = rowPk;
    this.instance = instance;
  }
}

//let solidified = false
export function reactive_cache(clientDB=__SPACETIMEDB__.clientDB as ClientDB & {solidified?:boolean}) {
  let solidified = clientDB?.solidified
  //let solidified = import.meta.hot?.data.solidified
  if (solidified) return console.log('Already Solidified')
  //solidified = true
  clientDB.solidified = true
  //import.meta.hot?.data.solidified = true
  

  console.log('Solidifying')
  let tables = clientDB.tables
  for (let [_name, table] of tables as Map<string, Table>) {
    //solidify_rows(table)
    solidify_table(table)
    //solidify_table_V2(table)
  }
}


let insertCB = (table:Table) => (dbOp:DBOp, reducerEvent:Red)=>{
  // another option is to use createStore and reconcile, 
  // but then we have to save the setter in/near the row too (seems awkward)
  // read/write segregation is nice tho... 
  // (may have to backtrack on direct iteration over table row instances)
  let row = createMutable<Record<string, any>>({...dbOp.instance, rowPk: dbOp.rowPk}) 
  table.instances.set(dbOp.rowPk, row)

  table.emitter.emit('insert', row, reducerEvent)
}

let updateCB = (table:Table) => (dbOp:DBOp, dbOpOld:DBOp, reducerEvent:Red)=>{
  let row = table.instances.get(dbOpOld.rowPk) as Record<string, any>
  let oldRow = {...row}

  batch(()=>{
    for(let k of Object.keys(row)) {
      row[k] = dbOp.instance[k]
    }
    row.rowPK = dbOp.rowPk

    table.instances.delete(dbOpOld.rowPk)
    table.instances.set(dbOp.rowPk, row)
  })

  table.emitter.emit('update', oldRow, row, reducerEvent)
}

let deleteCB = (table:Table) => (dbOp:DBOp, reducerEvent:Red)=>{
  let row = table.instances.get(dbOp.rowPk)!
  table.instances.delete(dbOp.rowPk);

  // This is signal that the row has been deleted (ie row_ref())
  (row as any).rowPk = undefined
  // could use anther property like __deleted or __live

  table.emitter.emit('delete', row, reducerEvent)
}


export function solidify_rows(table: Table) {
  // This is useful for 90% of cases as you mainly watch the 
  // reactive rows and use getInstances though .all()
  // you can't directly read the table data though...
  // (good reference for signal based reactive libs that cant wrap Map)
  let [track, dirty] = createSignal(undefined, {equals: false});

  // Whenever state changes, trigger update to tracked listeners
  let cb = dirty
  table.onInsert(cb)
  table.onUpdate(cb)
  table.onDelete(cb)

  let destroy = ()=>{
    table.removeOnInsert(cb)
    table.removeOnUpdate(cb)
    table.removeOnDelete(cb)
  }
  onCleanup(destroy)

  table.insert = insertCB(table)

  table.update = updateCB(table)

  table.delete = deleteCB(table)

  table.getInstances = createLazyMemo(() => {
    track()
    return [...table.instances.values()]
  })

  table.count = createLazyMemo(()=>{
    track()
    return table.instances.size
  })
}


export function solidify_table (table: Table) {
  // This extends the map instance with a reactive wrapper
  // this means you cn directly watch and iterate over the 
  // the table instances and get reactive updates 
  // (not that i necessarily recommend doing that tho)...
  // (good reference for signal based reactive that wrap Map)
  table.instances = new ReactiveMap<string, any>()

  table.insert = insertCB(table)

  table.update = updateCB(table)

  table.delete = deleteCB(table)

  table.getInstances = createLazyMemo(() => {
    return [...table.instances.values()]
  })

  table.count = createLazyMemo(()=>{
    return table.instances.size
  })
}


export function solidTable<T extends Table>(table: T) {
  /*
    minimal table wrapper:
      let [$Table] = solidTable(table)
      $Table().values()    // added alternative to all
      $Table().onInsert()  // old stuff there too
      etc.
  */

  // Register and Trigger reactive updates
  let [track, dirty] = createSignal(undefined, {equals: false});

  let cb = dirty
  table.onInsert(cb)
  table.onUpdate(cb)
  table.onDelete(cb)

  let destroy = ()=>{
    table.removeOnInsert(cb)
    table.removeOnUpdate(cb)
    table.removeOnDelete(cb)
  }
  onCleanup(destroy)

  let dbTable = __SPACETIMEDB__.clientDB.getTable(table.name)
  function getter() { 
    track()
    return dbTable || null 
  }
  getter.values = createLazyMemo(() => {
    track()
    return Array.from(dbTable.getInstances())
  })

  return [getter, destroy] as [typeof getter , ()=>void]
}










/***   SOLID JS V2.0   ***\
  - createMutable is being deprecated...
  - normal memo will behave like lazy memo

  theres really only four options to reconcile 
  the createMutable issue:
  - wrap createStore to mimic that functionality?
    - idk how off the top of my head... double proxy seems like a bad idea
  - create a secondary Map per table to store all the setters
    - extra memory, complexity, and management 
  - include the setter *in* the row...
    - easily accessible
    - minimal code complexity
    - only requires one lookup
    - only require one delete
  - use a 3rd party replacement
    - i'm sure primitives lib will add a drop-in replacement 

  I could just use vanilla signals cuz we prob really only need 
  shallow reactivity. But that makes everything a function call
  which changes how people expect to interact with stdb api/data
*/

//type Row = {[k:string]:any, __setter: ()=>SetStoreFunction<Record<string, any>>}
type Row = Record<string, any> & {__setter: ()=>SetStoreFunction<Row>}

let insertCB_V2 = (table:Table) => (dbOp:DBOp, reducerEvent:Red)=>{
  let row:Row, set_row:ReturnType<Row['__setter']>;
  ([row, set_row] = createStore<Row>({...dbOp.instance, rowPk: dbOp.rowPk, __setter: ()=>set_row}))
  table.instances.set(dbOp.rowPk, row)

  table.emitter.emit('insert', row, reducerEvent)
}

let updateCB_V2 = (table:Table) => (dbOp:DBOp, dbOpOld:DBOp, reducerEvent:Red)=>{
  let row = table.instances.get(dbOpOld.rowPk) as Row
  let oldRow = {...row, __setter: null} as Omit<Row, '__setter'>
  let setter = row.__setter()

  batch(()=>{
    setter({
      ...dbOp.instance,
      rowPK: dbOp.rowPk
    })
    table.instances.delete(dbOpOld.rowPk)
    table.instances.set(dbOp.rowPk, row)
  })
  
  table.emitter.emit('update', oldRow, row, reducerEvent)
}

let deleteCB_V2 = (table:Table) => (dbOp:DBOp, reducerEvent:Red)=>{
  let row = table.instances.get(dbOp.rowPk)
  table.instances.delete(dbOp.rowPk);

  // This is signal that the row has been deleted (ie row_ref())
  //(row as Row).__setter()('rowPK', undefined)
  //table.emitter.emit('delete', {...row, __setter: null}, reducerEvent)


  (row as Omit<Row, '__setter'>).__setter()({'rowPK': undefined, __setter: null})
  table.emitter.emit('delete', row, reducerEvent)
}


export function solidify_table_V2 (table: Table) {
  // This extends the map instance with a reactive wrapper
  // this means you cn directly watch and iterate over the 
  // the table instances and get reactive updates 
  // (not that i necessarily recommend doing that tho)...
  // (good reference for signal based reactive that wrap Map)
  table.instances = new ReactiveMap<string, any>()

  table.insert = insertCB_V2(table)

  table.update = updateCB_V2(table)

  table.delete = deleteCB_V2(table)

  // in v2 normal memo === LazyMemo
  table.getInstances = createLazyMemo(() => {
    return [...table.instances.values()]
  })

  // in v2 normal memo === LazyMemo
  table.count = createLazyMemo(()=>{
    return table.instances.size
  })
}
