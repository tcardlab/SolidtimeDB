


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

let owner = STDB_ID_NAME ?? `${module_name}-owner`

// Check if we want to run locally
if (STDB_SERVER_MODE === 'local') {
  let local_server = resolve_local_address()

  console.log(`Starting module "${module_name}" under ID "${STDB_ID_NAME}" on port "${local_server}" `)

  // Check if we need to init STDB Runtime
  // could be already running or on diff port...
  await start_or_use(local_server)

  if (!is_fast) {
    await register_server_address(server_name, server_address)

    // located in .spacetime/conf/id_ecdsa.pub by default
    await fingerprint(server_address)

    /*console.log(
      process.env.STDB_ID_NAME,
      process.env.STDB_ID_HEX,
      process.env.STDB_ID_Token,
    )*/
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
