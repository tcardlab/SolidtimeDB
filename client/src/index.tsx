import { render } from 'solid-js/web';
import { createRoot, Show } from 'solid-js'
//import 'solid-devtools'

import './index.css';
import App from './App';

import { hmrSafeClient, safeConnect } from '../STDB/utils'
import { get_client, init_stdb } from '../STDB/init';
/* createRoot(()=>{
  init_stdb()
  hmrSafeClient() // utilizes solid js onCleanup
}) */


const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
  throw new Error(
    'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?',
  );
}

render(() => {
  let clientVals = init_stdb()     // reactive cache must exist under root
  hmrSafeClient() // utilizes solid js onCleanup
  //^only does CLient events, not tables
  // maybe i should have it handle both?
  // yea, cuz reducers have listeners too
  // just iterate over all registered things

  return <App/>

  /* let client = get_client()
  safeConnect(client)
  return <Show when={clientVals.live()} fallback={'connecting...'}>
    <App/>
  </Show> */
}, root!);




// The following will not work due to CORs
import { Kysely } from 'kysely'
import { SpacetimeDialect } from '../kysely-stdb/dialect'
import { Message, User } from '@/module_bindings'


import {DatabaseTableClass} from '@clockworklabs/spacetimedb-sdk'
type InstanceType<T> = T extends new (...args: any[]) => infer R ? R : never;
type DatabaseFromBindings<T> = {
  [K in keyof T as T[K] extends DatabaseTableClass ? K : never]: InstanceType<T[K]>;
};
type DatabaseFrom<T extends {[key: string]: new (...args: any[]) => any}> = {
  [K in keyof T]: InstanceType<T[K]>
};

import * as Bindings from '@/module_bindings'
type Database = DatabaseFromBindings<typeof Bindings>

const db = new Kysely<Database>({
  dialect: new SpacetimeDialect({
    // must proxy due to cors...
    server: location.origin, //'http://localhost:3000', // __STDB_ENV__.STDB_ADDRESS,
    module: __STDB_ENV__.STDB_MODULE
  }),
})

async function query1() {
  const result = await db
    .selectFrom('Message')
    .selectAll()
    .execute()
  console.log('SQL:', result)
  return result
}

query1()