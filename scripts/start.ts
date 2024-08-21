// wonder if its just easier to load in the config.toml than
// rely on the cli errors

// need to add some process exits to halt process on unexpected errors

/*
# Module Name (by default server and identity will be named after this too)
STDB_MODULE="stdb-start"


# Paths (add bindings path?)
STDB_PATH=".spacetime"    # officially supported
STDB_SERVER_PATH="server"
STDB_BINDING_PATH="module_bindings"

# we could install the stdb exe locally too to to prevent lock issue, hmm

# Local
STDB_CLIENT_PORT="3000"
STDB_LOCAL_PORT="5000"
STDB_LOCAL_ADDRESS="localhost"  # "127.0.0.1"  # "0.0.0.0"
# Use "0.0.0.0" for remote server. see `spacetime start -h`


# Remotes
STDB_DEV_ADDRESS="https://testnet.spacetimedb.com"
STDB_PROD_ADDRESS="https://mainnet.spacetimedb.com"


# Host Targets (Perhaps just use remote env var name?)
STDB_CLIENT_MODE="local" # "development" # "local" # "production"
STDB_SERVER_MODE="local" # "development" # "local" # "production"


# Server Override (for custom server name)
# STDB_SERVER = "some-custom-server-name"


# Identity Import
# STDB_ID_NAME = "stdb-start-owner"
# STDB_ID_HEX = "93dda09db9a56d8fa6c024d843e805d8262191db3b4ba84c5efcd1ad451fed4e"
# STDB_ID_Token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJoZXhfaWRlbnRpdHkiOiI5M2RkYTA5ZGI5YTU2ZDhmYTZjMDI0ZDg0M2U4MDVkODI2MjE5MWRiM2I0YmE4NGM1ZWZjZDFhZDQ1MWZlZDRlIiwiaWF0IjoxNzA5MTUzOTE1LCJleHAiOm51bGx9.V9Fynu5a2riEztim0wglW-AVqvJdgxpKDJAHyoqoivStE15lmaE1frAjSugyQXHv534ZHwOgA_qMIVRta56Z3g"
*/


import {
  isRunningByAddr, start, start_or_use,
  gen, fingerprint, publish, set_identity,
  resolve_module_name, resolve_server_name, resolve_server_address, resolve_local_address,
  register_server_address, 
  identity_import
} from './utils'

let args = process.argv.slice(2)
let is_server = args.includes('server')
let is_clear = args.includes('clear')
let is_fast = args.includes('fast')  
// "fast" skips pub, gen, and server registry stuff 
// (good for frontend stuff. Don't run first time tho.)
// you'll want full start if doing server stuff or update module with pub command in diff terminal

/***  STDB  ***/

let {
  STDB_MODULE,
  STDB_SERVER_MODE,

  STDB_PATH,
  STDB_SERVER_PATH,
  STDB_BINDING_PATH,

  STDB_ID_NAME, STDB_ID_HEX, STDB_ID_Token
} = process.env

// ENV defaults if none provided
//STDB_PATH = STDB_PATH ?? '.spacetime' // STDB_PATH ?? '' for default at home dir?
STDB_SERVER_PATH = STDB_SERVER_PATH ?? 'server'
STDB_BINDING_PATH = STDB_BINDING_PATH ?? 'module_bindings'


let module_name = resolve_module_name()
let server_name = resolve_server_name()
// if server name override, no need to resolve/use address (assume its defined)
let server_address = resolve_server_address()

let owner = `${module_name}-owner`

// Check if we want to run locally
if (STDB_SERVER_MODE === 'local') {
  let local_server = resolve_local_address()

  // Check if we need to init STDB Runtime
  // could be already running or on diff port...
  await start_or_use(local_server)

  if (!is_fast) {
    await register_server_address(server_name, server_address)

    // located in .spacetime/conf/id_ecdsa.pub by default
    await fingerprint(server_address)

    if (STDB_ID_NAME && STDB_ID_HEX && STDB_ID_Token) {
      await identity_import()
    } else {
      await set_identity(server_name, owner)
    }
  }
}

if (!is_fast) await publish(module_name!, server_address, STDB_SERVER_PATH, is_clear)


/***  FE  ***/

if (!is_server) {
  if(!is_fast) await gen("typescript", STDB_BINDING_PATH, STDB_SERVER_PATH)
  Bun.spawn(['bun', 'start:FE'], {stdout:'inherit'})
}
