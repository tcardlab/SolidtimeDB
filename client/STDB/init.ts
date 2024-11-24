// pkg imports
import { SpacetimeDBClient, Identity } from "@clockworklabs/spacetimedb-sdk";
import { clearPriors, onSafeConnect, STDB_Event_Debugger, handleDisconnect } from './utils'
import { reactive_cache } from './solidDB'

// root level import
import { register, registerArr } from '@/module_bindings'
import { Accessor, createRoot, createSignal, onCleanup } from "solid-js";
await register()

let client: SpacetimeDBClient;

// almost wonder if these should be signals.
// then i can detect connection update by proxy
let global_token: string | undefined;
let global_identity: Identity | undefined;
const AUTH_TOKEN_KEY = `${__STDB_ENV__.STDB_MODULE}_safeConnect_auth_token`
const IDENTITY_KEY = `${__STDB_ENV__.STDB_MODULE}_safeConnect_identity`


STDB_Event_Debugger()

export function init_stdb() {
  // Catch Project Change: if project name DNE or different
  clearPriors(__STDB_ENV__.STDB_MODULE)
  // not strictly necessary anymore, tho people may wish to adapt it.


  // TO DO:
  // registerArr(Object.values(Bindings))
  
  // Not sure how to specify multi-client...
  global_token = localStorage.getItem(AUTH_TOKEN_KEY) || undefined;
  client = new SpacetimeDBClient(__STDB_ENV__.STDB_WS, __STDB_ENV__.STDB_MODULE, global_token);
  
  reactive_cache(client.db)

  // Catch bad token - assumes 1 client...
  // If client connection fails on bad token,
  // we should delete auth_token from localStorage and try once more
  onSafeConnect(client, (token: string, identity: Identity)=>{
    // success
    if (!global_token) global_token = token
    global_identity = identity
    localStorage.setItem(AUTH_TOKEN_KEY, token); // set good token
    localStorage.setItem(IDENTITY_KEY, identity.toHexString()); // set good token
  }, ()=>{
    // Set invalid auth token to test:
    localStorage.removeItem(AUTH_TOKEN_KEY) // remove bad token
    localStorage.removeItem(IDENTITY_KEY)
    global_token=undefined

    // wait does this need to disconnect first?
    client.live = false // STDB bug doesn't do this automatically
    client.connect()
  })

  handleDisconnect(client)

  return useClientVals(client)
}


export function get_token() {
  return global_token
}

export function get_identity() {
  return global_identity
}

export function get_client() {
  return client
}


// Multiclient support hypothetical
interface ClientVals {
  token: Accessor<string|undefined>
  identity: Accessor<Identity|undefined>
  live: Accessor<boolean>
}
let client_map = new Map<SpacetimeDBClient, ClientVals>()
export function register_client(client=__SPACETIMEDB__.spacetimeDBClient) {
  if (!client) throw new Error('Bad client.')

  let [token, set_token] = createSignal<string|undefined>(client.token)
  let [identity, set_identity] = createSignal<Identity|undefined>(client.identity)
  let [live, set_live] = createSignal<boolean>(client.live)

  let client_vals: ClientVals = { token, identity, live }
  client_map.set(client, client_vals)

  let connectCB = (_token:string, _identity:Identity)=>{
    set_token(_token)
    set_identity(_identity)
    set_live(true)
  }
  client.on('connected', connectCB)

  let discCB = ()=>{ set_live(false) }
  client.on('disconnected', discCB)

  onCleanup(()=>{
    client.off('connected', connectCB)
    client.off('disconnected', discCB)
  })

  return client_vals
}

export function useClientVals(client=__SPACETIMEDB__.spacetimeDBClient) {
  if (!client) throw new Error('Bad client.')
  return client_map.get(client) || register_client(client)
}