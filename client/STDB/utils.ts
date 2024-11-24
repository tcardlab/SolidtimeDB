import { ReactiveMap } from "@solid-primitives/map";
import { createMemo, onCleanup, Accessor, Setter, createSignal, untrack, createComputed, on, runWithOwner, getOwner, createEffect } from 'solid-js'
import { SpacetimeDBClient, Identity, ReducerEvent, DatabaseTable, __SPACETIMEDB__ } from "@clockworklabs/spacetimedb-sdk";
import { live_filter } from "./live_filter"
import { createLazyMemo } from "@solid-primitives/memo";
import { unwrap } from "solid-js/store"
import { Table } from "@clockworklabs/spacetimedb-sdk/dist/table";

export function deleteAllCookies() {
  for (let cookie of document.cookie.split(";")) {
    // Remove any existing expiration, then add expiration
    let newCookie = cookie.replace(/expires=[^;]*/, '');
    newCookie += ";expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = newCookie;
  }
}

export function clearPriors(project_name:string, clear_all_storage=false) {
  // Clear data from other project (cuz we often use the same localhost ports)

  let currentName = localStorage.getItem('STDB_NAME')
  if (project_name !== currentName) {
    if (clear_all_storage) {
      localStorage.clear()
      sessionStorage.clear()
      deleteAllCookies() // httpOnly cookies will remain
    } else {
      localStorage.removeItem('STDB_NAME')

      // not really necessary as STDB_NAME has been appended
      // for project specific keys here
      //localStorage.removeItem('safeConnect_identity')
      //localStorage.removeItem('safeConnect_auth_token')

      localStorage.removeItem('identity')
      localStorage.removeItem('auth_token')
    }
  }

  localStorage.setItem('STDB_NAME', project_name)
}


/*
  safeConnect and onSafeConnect
  can be used together (though a tad redundant)
  or used separately, both will ensure a proper connection
*/
const AUTH_TOKEN_KEY = `${__STDB_ENV__.STDB_MODULE}_safeConnect_auth_token`
export async function safeConnect(client:SpacetimeDBClient, /* address */) {
  // might wish to clean this up a bit later
  let address = location.origin //__STDB_ENV__.STDB_ADDRESS

  if (client.live) return console.log('Client already connected.')

  // Pre-catch bad token
  try {
    let res = await fetch(`${address}/identity/websocket_token`, {
      "headers": {
        "authorization": `Basic ${btoa('token:'+localStorage.getItem(AUTH_TOKEN_KEY))}`,
      },
      "method": "POST"
    });
    if (res.status === 200) {
      return client.connect() // connect with token
    }
  } catch(err) {
    // console.log(err as Error)
  }

  localStorage.removeItem(AUTH_TOKEN_KEY)
  client.connect() // connect anonymously
}

// ATM, this should be run top level so HMR does full reload
// otherwise you may get mem-leak between saves on:
//   client.emitter.on('connected',()=>{})
// It also lacks an owner, so reactivity wont work either.
export function onSafeConnect(
  client: SpacetimeDBClient, 
  onSuccess:(token:string, identity:Identity)=>void, 
  onErr:(token:string, identity:Identity)=>void
) {
  let initToken = client?.['runtime']?.auth_token
  client.onConnect((token, identity) => {
    const urlParams = new URLSearchParams(client?.['ws']?.url);
    const isTokenValid = urlParams.get('token');

    // If init token set, but determined incorrect on connect
    if(initToken && !isTokenValid) {
      console.warn('Invalid Token: ', client.token)
      onErr(token, identity)
      return
    }
    onSuccess(token, identity)
  })
}


// Realistically, if you just need token & identity
// you could just grab them off localStorage.
type ConnectCB = ({token, identity}:{token:string, identity:Identity}) => void
export function hmrConnect(
  {client, once, perLoad, onError}: 
  {client: SpacetimeDBClient, once?: ConnectCB, perLoad?: ConnectCB, onError?:(err:Error)=>void}
): void {
  // We use an explicit owner so people can use signals within the event callbacks
  let owner = getOwner()

  let initToken = client?.['runtime']?.auth_token
  let connectCB = (token:string, identity:Identity, /* address:Address */) => {
    const urlParams = new URLSearchParams(client?.['ws']?.url);
    const isTokenValid = urlParams.get('token')

    runWithOwner(owner, ()=>{
      // If init token set, but determined incorrect on connect
      if(initToken && !isTokenValid) {
        return onError?.(new Error('Invalid Token: ' +client.token))
      }

      // client.live is not reliable atm... is true even when ws fails
      if(!client.live) onError?.(new Error('client not connected'))
        try{
          once && once({token, identity})
          perLoad && perLoad({token, identity})
    
          if (import.meta?.hot) {
            import.meta.hot.data['hmrConnect_token'] = token
            import.meta.hot.data['hmrConnect_identity'] = identity
            //import.meta.hot.data['hmrConnect_address'] = address
            import.meta.hot.data['hmrConnect_once'] = true
          }
        } catch(err) {
          onError?.(err as Error)
        }
    })
  }

  client.onConnect(connectCB)
  onCleanup(()=>client.emitter.off('connected', connectCB))

  // I hope these work in prod too as this is 
  // useful for routing post-connect
  if (import.meta.hot && import.meta.hot.data['hmrConnect_once']) {
    let {hmrConnect_token:token, hmrConnect_identity:identity} = import.meta.hot!.data
    try{
      perLoad && perLoad({token, identity})
    } catch(err) {
      onError?.(err as Error)
    }
  }
}

async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  isSuccess: (result: T) => boolean|Promise<boolean>,
  maxRetries: number = 5,
  initialDelay: number = 1000
): Promise<T> {
  for (let retries = 0; retries <= maxRetries; retries++) {
    try {
      const result = await operation();
      if (await isSuccess(result)) {
        return result;
      }
      throw new Error('Operation did not succeed');
    } catch (error) {
      if (retries === maxRetries) {
        console.error('Max retries reached. Throwing error.');
        throw error;
      }

      let delay = initialDelay * Math.pow(2, retries);
      delay = delay/2 + Math.random()*delay/2 // Jitter
      console.log(`Attempt ${retries + 1} failed. Retrying in ${(delay/1000)|0} seconds...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Unexpected end of function');
}

export function handleDisconnect(client:SpacetimeDBClient) { 
  client.on('disconnected', async () => {
    client.live = false // fix for STDB bug
    console.log('disconnected');

    try {
      await withExponentialBackoff(
        () => client.connect(),
        () => client.live 
        // idk if live is set b4 connect resolves...
        // onConnect is inconvenient for this purpose,
        // but might be necessary.
      )
      console.log('Reconnected successfully!')
    } catch (error) {
      console.error('Failed to fetch data:', error)
    }
  })
}



function hmrSafeTable(table:Table) {
  let ogInsert = table.onInsert
  let ogUpdate = table.onUpdate
  let ogDelete = table.onDelete

  table.onInsert = (cb)=>{
    ogInsert(cb)
    onCleanup(()=>table.removeOnInsert(cb))
  };
  table.onUpdate = (cb)=>{
    ogUpdate(cb)
    onCleanup(()=>table.removeOnUpdate(cb))
  };
  table.onDelete = (cb)=>{
    ogDelete(cb)
    onCleanup(()=>table.removeOnDelete(cb))
  };
}

export function hmrSafeClient(client = __SPACETIMEDB__.spacetimeDBClient as SpacetimeDBClient) {
  if (!__SPACETIMEDB__ || !__SPACETIMEDB__.spacetimeDBClient) {
    throw new Error('spacetimeDBClient not found.')
  }

  let ogOn = client.emitter.on
  client.emitter.on = function wrap(name, cb) {
    onCleanup(()=>client.emitter.off(name as any, cb))
    return ogOn.bind(client.emitter)(name, cb)
  }

  let ogAdd = client.emitter.addListener
  client.emitter.on = (name, cb)=>{
    onCleanup(()=>client.emitter.removeListener(name as any, cb))
    return ogAdd.bind(client.emitter)(name, cb)
  };

  //NOTE: Reducers register on client.
  //so the code above covers them too.
  
  let tables = client.db.tables
  for (let [_name, table] of tables as Map<string, Table>) {
    hmrSafeTable(table)
  }

  //i don't think they use this
  //client.emitter.prependListener
}

export function STDB_Event_Debugger() {
  // Detect hmr event mem leaks
  if (import.meta.hot) {
    function cap(s:string) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    type EventOps = 'insert'|'update'|'delete'
    type EventMap = Map<EventOps, Set<Function>>
    type TableMap = Map<string, EventMap>
    let thing = ()=>{
      let table_map = import.meta.hot!.data['event_debug'] as TableMap
      for(let [name, table] of __SPACETIMEDB__.clientDB.tables) {
        let event_map = table_map.get(name) || table_map.set(name, new Map()).get(name)!
        for (let event of ['insert', 'update', 'delete'] as EventOps[]) {
          let listener_set = new Set(table.emitter.listeners(event))
          let old_set = event_map.get(event) || new Set()

          let diff = old_set.intersection(listener_set)
          event_map.set(event, listener_set)

          if(listener_set.size === old_set.size) {
            // if same size, then no buildup, ie no mem leak.
            continue
          }

          if(diff.size) {
            console.log(old_set, listener_set)
            console.warn(`${name}.on${cap(event)}() leak?`, diff)
            let unique_fns = new Set([...diff].map(fn=>fn.toString()))
            console.info('Suspect Functions:\n',[...unique_fns].join('\n\n'))
          }  
        } 
      } 
    }

    import.meta.hot.on('vite:beforeUpdate', ()=>{
      // refresh each load
      import.meta.hot!.data['event_debug'] = new Map() as TableMap
      thing()
    })
    import.meta.hot?.on('vite:afterUpdate', ()=>{
      // we compare before and after to identify leftovers
      thing()
    })
  } 
}


interface StdbFilterOptions {
  memo?: boolean,
  name?: string,
  debug?: boolean
}
export function stdb_filter
  <T extends abstract new (...args: any) => any>
  (
    table: T, 
    filter: Accessor<undefined | ((item: InstanceType<T>)=>boolean)>,
    options: StdbFilterOptions = {memo: false}
  ) 
{

  let TableClass = table as any as typeof DatabaseTable
  if (TableClass.db === undefined) throw new Error('Error accessing table, is everything initialized and registered?')
  let raw_table = TableClass.db.getTable(TableClass.tableName)

  type Red = ReducerEvent | undefined
  type Row = InstanceType<T>
  type SolidRow = InstanceType<T> & {
    rowPk: string
  }


  let deref_source;
  if (options.memo) {
    // lazy memo only re-calcs on demand if deps are dirt. cached val increases mem footprint tho...
    // if instances have not updated, prevents recalculation at the cost of memory
    // not great for large, volatile data.

    // Lazy memo
    let memo_getter = createLazyMemo(() => new Map(raw_table.instances as ReactiveMap<string, Row>));
    deref_source = ()=>untrack(memo_getter)
  } else {
    // if instances have not updated, prevents recalculation at the cost of memory
    // must untrack as not to trigger refilter on every insert
    deref_source = ()=>untrack(()=>new Map(raw_table.instances as ReactiveMap<string, Row>))
  }
  
  
  return live_filter<Row>(
    deref_source,
    filter,
    () => ({
      /*
       NOTE:
        we can only send new Row as value for update and insert 
        as refilter only has one row of info to work with anyway
      */
      register_insert: (cb) => {
        let normalized_cb = (row: any, reducerEvent: Red)=>{
          cb((row as SolidRow).rowPk, row)
        }
        TableClass.onInsert(normalized_cb)
        return ()=>{
          TableClass.removeOnInsert(normalized_cb)
        }
      },
      register_update: (cb) => {
        let normalized_cb = (old_row: any, row: any, reducerEvent: Red)=>{
          cb((old_row as SolidRow).rowPk, (row as SolidRow).rowPk, row)
        }
        TableClass.onUpdate(normalized_cb)
        return ()=>TableClass.removeOnUpdate(normalized_cb)
      },
      register_delete: (cb) => {
        let normalized_cb = (old_row: any)=>{
          cb((old_row as SolidRow).rowPk)
        }
        TableClass.onDelete(normalized_cb)
        return ()=>TableClass.removeOnDelete(normalized_cb)
      },
      register_cleanup: ()=>{
        if (!options.debug) return
        let tb = __SPACETIMEDB__.clientDB.getTable(TableClass.tableName)
        console.log(
          `${options.name || TableClass.tableName} Filter Cleaned. Remaining:`,
          `\n\t• insert: ${tb.emitter.listenerCount('insert')}`,
          `\n\t• update: ${tb.emitter.listenerCount('update')}`,
          `\n\t• update: ${tb.emitter.listenerCount('delete')}`,
        )
      }
    })
  ) as ()=>Map<string, Row>
}


export function get_raw_table<T extends abstract new (...args: any) => DatabaseTable>(table: T) {
  let TableClass = table as any as typeof DatabaseTable
  if (TableClass.db === undefined) throw new Error('Error accessing table, is everything initialized and registered?')
  let raw_table = TableClass.db.getTable(TableClass.tableName)
  return raw_table
}


export function get_map<T extends abstract new (...args: any) => DatabaseTable>(table: T) {
  type Row = InstanceType<T>
  return get_raw_table<T>(table).instances as ReactiveMap<string, Row>
}


/*
  This is a wrapper for both the raw stdb instance map as well as a filtered map.
  This means you can generically to get the whole table or filter it at anytime.
  Filtering is cleared and disabled when undefined to minimize memory and comp expenses.
*/
type TableAccessor<T> = Accessor<Map<string, T>> & { all:()=>T[] }
export function STDB_Table
  <T extends abstract new (...args: any) => any>
  (
    table: T,
    init_filter?: undefined | ((item: InstanceType<T>)=>boolean),
    options: StdbFilterOptions = {memo: false}
  )
{
  let [filter_signal, set_filter] = createSignal(init_filter)
  let filted_data = stdb_filter<T>(table, filter_signal, options)

  // NOTE: hmm seems we may have to make instances a reactive map to keep dom updated
  // this means we may need to untrack source in live_filter to prevent full refilters on inserts etc. 
  let source = get_map(table)
  let val_map = createMemo(on(filter_signal, () => {
    // If a filter exists, return filtered map, otherwise return source.
    // this keeps memory to a minimum preventing filter from duping the source.
    return filter_signal() ? filted_data() : source
  })) as TableAccessor<InstanceType<T>>

  val_map.all = createLazyMemo(()=>{
    return Array.from(val_map().values())
  })

  return [val_map, set_filter] as [
    TableAccessor<InstanceType<T>>, 
    Setter<((item: InstanceType<T>) => boolean) | undefined>
  ]
}


/*
It probably doesn't make much difference whether we filter the table as row ops are processed
vs after the table is populated, its basically the same number of function calls. 
(idk if the event handling adds overhead when listening to each op...)

However, what is potentially significant is the down stream effects being triggered for each update
when we can perhaps ignore all that till the whole table is populated.
(resubscribing may bring this issue up again...)

initialStateSync is on the client rather than the particular table, which is inconvenient for us.
Its also debatable whether this should be handled within the function or externally:
  let msgs, set_filter;
  let client = get_client()
  client.on('initialStateSync', ()=>{
    ([msgs, set_filter] = STDB_Table(Message))
  })

idk... might be over kill
*/
//              WIP
/*
type StdbTableOptions = StdbFilterOptions & {client: SpacetimeDBClient, skipInit: boolean}
type TableAccessor<T> = Accessor<Map<string, T>> & { all:()=>T[] }
export function STDB_Table
  <T extends abstract new (...args: any) => any>
  (
    table: T,
    init_filter?: undefined | ((item: InstanceType<T>)=>boolean),
    options: StdbTableOptions = {memo: false, client: __SPACETIMEDB__.spacetimeDBClient!, skipInit:true}
  )
{

  let [filter_signal, set_filter] = createSignal(init_filter) //createSignal(undefined)
  let filted_data = stdb_filter<T>(table, filter_signal, options)
  let [source, set_source] = createSignal(new Map())

  let initCB = ()=>{
    //set_filter(init_filter)
    set_source(get_map(table))
  }
  if (options.client && options.skipInit) {
    options?.client.on('initialStateSync', initCB)
    onCleanup(()=>options?.client.off('initialStateSync', initCB))
    // might need set_source(new Map()) on subscription update too
  } else {
    initCB()
  }
  
  let val_map = createMemo(on(filter_signal, () => {
    // If a filter exists, return filtered map, otherwise return source.
    // this keeps memory to a minimum preventing filter from duping the source.
    return filter_signal() ? filted_data() : source()
  })) as TableAccessor<InstanceType<T>>

  val_map.all = createLazyMemo(()=>{
    return Array.from(val_map().values())
  })

  return [val_map, set_filter] as [
    TableAccessor<InstanceType<T>>, 
    Setter<((item: InstanceType<T>) => boolean) | undefined>
  ]
}
*/

type SafeRow <T> = Accessor<T|null>
export function row_ref<T extends DatabaseTable>(row_proxy: T){
  let [row, set_row] = createSignal<T|null>(row_proxy)

  createEffect(on(()=>(row_proxy as any)?.rowPk, v=>{
    if (v===undefined) set_row(null)
  }))

  return row as SafeRow<T>
}


export type Red = ReducerEvent | undefined
export type I<T extends new (...args: any[]) =>any> = InstanceType<T>
export type IN<T extends new (...args: any[]) =>any> = InstanceType<T> | null
export type CB<T extends new (...args: any[]) =>any, V extends IN<T>|null, OV extends IN<T>|null> = (v:V, vOld:OV, red?:Red)=>void
export type Independent = ()=>void
export type CleanUp = ()=>void

// {prev: OV} vs {old_val: OV}?
export type DestructCB<T extends new (...args: any[]) =>any, V extends IN<T>|null, OV extends IN<T>|null> = (params: {val:V, prev:OV, red:Red})=>void

export function D
  <T extends new (...args: any) => any, V extends IN<T>, VO extends IN<T>>
  (cb:DestructCB<T, V, VO>)
: CB<T, V, VO>{;
  return (val, prev, red)=>cb({val, prev, red})
}

export function onInsert
  <T extends new (...args: any) => any>
  (table: T, cb:CB<T, I<T>, null>): CleanUp
{
  let normCB = (v:I<T>, red:Red) => { cb(v, null, red) }

  (table as any as Table).onInsert(normCB)
  let unsub = () => (table as any as Table).removeOnInsert(normCB)
  onCleanup(unsub)

  return unsub
}

export function onInsertD 
  <T extends new (...args: any) => any>
  (table: T, cb:DestructCB<T, I<T>, null>): CleanUp
{
  return onInsert(table, D(cb))
}

export function onUpdate
  <T extends new (...args: any) => any>
  (table: T, cb:CB<T, I<T>, I<T>>)
{
  let normCB = (vOld:I<T>, v:I<T>, red:Red)=>{cb(v, vOld, red)}

  (table as any as Table).onUpdate(normCB)
  let unsub = () => (table as any as Table).removeOnUpdate(normCB)
  onCleanup(unsub)

  return unsub
}
export function onUpdateD
  <T extends new (...args: any) => any>
  (table: T, cb:DestructCB<T, I<T>, I<T>>): CleanUp
{
  return onUpdate(table, D(cb))
}


// Inserts and Updates are ultimately the same state.
// so this can be a convenience
export function onUpsert
  <T extends new (...args: any) => any>
  (table:T, cb:CB<T, I<T>, IN<T>>)
{
  let rmIns = onInsert(table, cb)
  let rmUpd = onUpdate(table, cb)

  let unsub = () => {
    rmIns()
    rmUpd()
  }
  onCleanup(unsub)

  return unsub
}
export function onUpsertD
  <T extends new (...args: any) => any>
  (table: T, cb:DestructCB<T, I<T>, IN<T>>): CleanUp
{
  return onUpsert(table, D(cb))
}


export function onDelete
  <T extends new (...args: any) => any>
  (table: T, cb:CB<T, null, I<T>>)
{
  let normCB = (vOld:I<T>, red:Red)=>{cb(null, vOld, red)}
  
  (table as any as Table).onDelete(normCB)
  let unsub = () => (table as any as Table).removeOnDelete(normCB)
  onCleanup(unsub)

  return unsub
}
export function onDeleteD
  <T extends new (...args: any) => any>
  (table: T, cb:DestructCB<T, null, I<T>>): CleanUp
{
  return onDelete(table, D(cb))
}

export function onInit(cb:(...args:any[])=>void) {
  let client = __SPACETIMEDB__.spacetimeDBClient
  if (!client) throw new Error('spacetimeDBClient is undefined')
  
  client.on('initialStateSync', cb)
  let unsub = () => client?.off?.('initialStateSync', cb)
  onCleanup(unsub)

  return unsub
}

// have to detect null to determine what the op is.
export function onChange
  <T extends new (...args: any) => any>
  (table:T, cb:CB<T, IN<T>, IN<T>>)
{
  let rmIns = onInsert(table, cb)
  let rmUpd = onUpdate(table, cb)
  let rmDel = onDelete(table, cb)

  let unsub = () => {
    rmIns()
    rmUpd()
    rmDel()
  }
  onCleanup(unsub)

  return unsub
}


// This passes the event type so it easier to filter by
export type ChangeCB<T extends new (...args: any[]) =>any> = (action:'+'|'-'|'=', v:IN<T>, vOld?:IN<T>, red?:Red)=>void
export function onChange2
  <T extends new (...args: any) => any>
  (table:T, cb:ChangeCB<T>, sub:('+'|'-'|'=')[]=['+','=','-'])
{ 
  type Row = IN<T>
  let table_class = (table as any as Table)

  let onInsertCB = (value: Row, red: Red) => {cb('+', value, null, red)}
  if (sub.includes('+')) table_class.onInsert(onInsertCB)

  let onUpdateCB = (value: Row, oldValue:Row, red: Red) => {cb('=', value, oldValue, red)}
  if (sub.includes('=')) table_class.onUpdate(onUpdateCB)

  let onDeleteCB = (oldValue:Row, red: Red) => {cb('=', null, oldValue, red)}
  if (sub.includes('-')) table_class.onDelete(onDeleteCB)

  let unsub = () => {
    if (sub.includes('+')) table_class.removeOnInsert(onInsertCB)
    if (sub.includes('=')) table_class.removeOnUpdate(onUpdateCB)
    if (sub.includes('-')) table_class.removeOnDelete(onDeleteCB)
  }
  onCleanup(unsub)

  return unsub
}



/*
  NOTE: we again run into this issue where 
  the filter criteria could change mid search...
  Say we are searching identity, yet the client is not
  connected yet, that value may change once connected
  which required a full re-filter...
*/
export function oneOffFind
  <T extends new (...args: any) => any>
  (table: T, filter: (row:I<T>)=>boolean, options={check_cache:true, check_update:true, check_insert:true}):
  SafeRow<I<T>>
{
  // searches cache and incoming messages

  // Type Pain
  type Row = I<T>
  let table_class = table as typeof table & Table & typeof DatabaseTable
  //let table_class = table as typeof table & Table & {all: any} //(table as any as Table & {all: any}) // as typeof DatabaseTable
  //(table as any as Table & {all: any})

  let [result, set_result] = createSignal<Row | null>(null)

  // from row_ref() as its simpler than using that
  createEffect(on(()=>(result() as any)?.rowPk, v=>{
    if (v===undefined) set_result(null)
  }))

  if (options.check_cache) {
    let res = (table_class.all() as Row[]).find((row)=>filter(row))
    if (res) {
      set_result(res)
      return result
    }
  }

  let findInsertCB = (value: Row, red: Red) => {
    let is_found = filter(value)
    if (is_found) {
      set_result(value)
      table_class.removeOnInsert(findInsertCB)
      return
    }
  }

  let findUpdateCB = (oldValue: Row, value:Row, red: Red) => {
    let is_found = filter(value)
    if (is_found) {
      set_result(value)
      table_class.removeOnUpdate(findUpdateCB)
      return
    }
  }

  if (options.check_insert) table_class.onInsert(findInsertCB)
  if (options.check_update) table_class.onUpdate(findUpdateCB)

  onCleanup(() => {
    if (options.check_insert) table_class.removeOnInsert(findInsertCB)
    if (options.check_update) table_class.removeOnUpdate(findUpdateCB)
  })

  return result
}



export function createDeferred() {
  // watch condition array to go all true for when to process buffered row_ops
  // row_ops are not guaranteed to come in ordered, so this waits for opportune timing.
  // (eg. parent and child items to connect them all once populated)
  
  /* 
    Say we have two tables, a Parent table and a Children table:
    - we are subscribed to both, but can't guarantee
      which data set we'll receive first 
    - both tables are required to confirm the completeness of load
      - Children table doesn't say how many parts the Parent has
    - we could be receiving Children of various Parents out of order
  
    
    To solve this generally:
    - we need a key that defines the relation between these tables
    - we need a condition to determine when thing can star being 
      processed
    - Two options to process
      1. buffering - deffer row-ops and ony process while condition 
         true
      2. filter table - essentially the same, but no way simple way 
         to clear the buffer
    - if you use an event based system its hard to know when to 
      clean things up...
      - we'll need a condition to determine when we are finished.
  */
  (
    parent: Table,  // multiple?
    child: Table,   // multiple?
    // run on parent and children to determine how they are connected
    // related parent and children data should return same values
    keyFunction:(row:any[])=>string|number,

    // determines when a particular deferment has finished processing
    completion:(parent:Table, child:Table)=>boolean,

    onComplete:(filtered_tabled:Table)=>void,

    // default: does parent contain deferment key?
    process:()=>boolean
  ) => {
    
    // my hesitation is that at its at its heart, 
    // this doesn't feel like a very reactive/derived 
    // methodology...

  }
} // undeveloped


// conditions:(()=>boolean)[]  ?
export function createAwait(table:any, condition:()=>boolean, cb:()=>void) {
  // similar to deferred, awaiting some set of conditions to be true
  // in order to perform some process/action. (eg. loading items)
  let clear = onChange(table, (val, oldVal, red)=>{
    if (condition()) {
      cb()
      clear()
    }
  })
} // untested

// assuming table reactive 
export function createAwait2(table:any, condition:()=>boolean, cb:()=>void) {
  // similar to deferred, awaiting some set of conditions to be true
  // in order to perform some process/action. (eg. loading items)

  let [is_resolved, set_resolved] = createSignal(false)
  createComputed(on(table, ()=>{
    if (!is_resolved() && condition()) {
      cb()
      set_resolved(true)
    }
  }))
} // untested


// idk...
export function awaitData(filter_table:any, condition:()=>boolean) {
  //let [is_resolved, set_resolved] = createSignal(false)
  let is_resolved= false 
  return new Promise((resolve)=>{
    createComputed(on(filter_table, ()=>{
      if (!is_resolved && condition()) {
        is_resolved = true
        resolve(filter_table)
      }
    }))
  })
} // untested



/***   Data Conversions (untested)   ***/

export let RowsToArray = (table: typeof DatabaseTable) =>{
  return table.all().map((row:any)=>Object.entries(row))
}

export let RowsToObject = (table: typeof DatabaseTable) =>{
  // useful to deref proxies
  return table.all().map((row:any)=>unwrap(row))
}

export let valParse = (v:any) => {
  if (v instanceof Identity) {
    return v.toHexString()
  }
  if (typeof v === 'bigint') {
    return v.toString()
  }
  return v
}
 
export let RowParse = (row:Record<string, any>) => {
  return Object.entries(row).reduce((acc, [key, val])=>{
    return {...acc, [key]:valParse(val)}
  }, {})
}

export let RowToString = (row: Record<string, any>) =>{
  return JSON.stringify(RowParse(unwrap(row)))
}

export let RowsToString = (table: typeof DatabaseTable) =>{
  return table.all().map(RowToString)
}


// for reversible stringification
export function STDB_Replacer(key: string, v: any): any {
  // let STDB_String = JSON.stringify(STDB_Thing, STDB_Replacer)
  if (v instanceof Identity) {
    return v.toHexString()+'_IDENTITY'
  }
  if (typeof v === 'bigint') {
    return v.toString()+'_BIGINT'
  }
  return v
}
export function STDB_Reviver(key: string, value: any): any {
  // let STDB_Thing = JSON.parse(STDB_String, STDB_Reviver)
  if (typeof value === 'string' && /^\d_IDENTITY$/.test(value)) {
    return Identity.fromString(value.slice(0, -1 * '_IDENTITY'.length));
  }
  if (typeof value === 'string' && /^0[xX][0-9a-fA-F]_BIGINT$/.test(value)) {
    return BigInt(value.slice(0, -1 * '_BIGINT'.length));
  }
  return value;
}
