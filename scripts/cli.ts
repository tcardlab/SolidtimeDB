/*

Intended for a single module. 
if you have multiple modules in a single project,
you may need to adapt things to fit your needs.

*/

import { exec, execSync } from 'child_process'
import { $ } from 'bun'
import {
  start_or_use,
  gen, publish,
  resolve_module_name, 
  resolve_server_address,
  delete_dir
} from './utils'

// Resolve EXE Path
import path from 'node:path';
let { STDB_EXE_PATH } = process.env
let STDB = STDB_EXE_PATH ? path.join(STDB_EXE_PATH,'spacetime') : 'spacetime'


let {
  STDB_MODULE,
  STDB_SERVER_MODE,

  STDB_PATH,
  STDB_SERVER_PATH,
  STDB_BINDING_PATH,

  STDB_DEV_ADDRESS,
  STDB_PROD_ADDRESS
} = process.env


// ENV defaults if none provided
STDB_PATH = STDB_PATH ?? '.spacetime' // STDB_PATH ?? '' for default at home dir?
STDB_SERVER_PATH = STDB_SERVER_PATH ?? 'server'
STDB_BINDING_PATH = STDB_BINDING_PATH ?? 'module_bindings'


let server_address = resolve_server_address()
let module_name = resolve_module_name()


async function handle_quick_start() {
  let kill_fn: (()=>void) | undefined; // only defined if started here
  if (STDB_SERVER_MODE === 'local') {
    kill_fn = await start_or_use(server_address)
    await $`sleep 1` // kinda arbitrary...
  }
  process.on('exit', ()=>kill_fn?.());
  return kill_fn!  // should only kill if STDB immediately run here
}


let cmd_obj = {
  async start() {
    await start_or_use(server_address)
  },

  async gen() {
    await gen("typescript", STDB_BINDING_PATH, STDB_SERVER_PATH)
  },

  async publish(...args: string[]) {
    let useClear = args.findIndex(value => /^-c$/.test(value)) !== -1

    // Uses ENV defaults
    let server_address = resolve_server_address()

    if (STDB_SERVER_MODE === 'local') {
      await start_or_use(server_address)
    }

    await publish(module_name!, server_address, STDB_SERVER_PATH!, useClear)

    if (server_address.includes('spacetimedb.com')) {
      let proc = await $`${STDB} dns lookup ${server_address}`
      console.info(`Dashboard Link: https://spacetimedb.com/dashboard/${proc.stdout.toString()}`)
    }
  },

  async pubTo(location: string, ...args: string[]) {
    let useClear = args.findIndex(value => /^-c$/.test(value)) !== -1

    let server_address;

    switch (location) {
      case 'dev':
        server_address = STDB_DEV_ADDRESS ?? "https://testnet.spacetimedb.com"
        process.env['STDB_SERVER_MODE'] = 'development'
        break
      case 'prod':
        server_address = STDB_PROD_ADDRESS ?? "https://mainnet.spacetimedb.com"
        process.env['STDB_SERVER_MODE'] = 'production'
        break
      default:
        server_address = location
    }
    let name = resolve_module_name()

    if (STDB_SERVER_MODE === 'local') {
      await start_or_use(server_address)
    }

    let res = await publish(name!, server_address, STDB_SERVER_PATH!, useClear)
    console.log(res)
    
    if (server_address.includes('spacetimedb.com')) {
      /*
       let proc = await $`spacetime dns lookup -s ${server_address} ${name}`
       console.info(`Dashboard Link: https://spacetimedb.com/dashboard/${proc.stdout.toString()}`)
      */

      let match = res.match(/address: ([0-9A-Fa-f]+)/i)
      if (match) console.info(`Dashboard Link: https://spacetimedb.com/dashboard/${match[1]}`)
    }
  },
  
  async sql(...query:string[] /* ...args:string[] */) {
    // bun run sql "SELECT name FROM User"
    let kill_fn = await handle_quick_start()
    let proc = execSync(`${STDB} sql  --server ${server_address} "${module_name}" "${query.join(' ')}"`)
    console.log(proc.toString())
    kill_fn?.()
  },

  async call(reducer_name:string, json_arg:string, ...args:string[]) {
    let kill_fn = await handle_quick_start()
    let proc = await $`${STDB} call --server ${server_address} ${args.join(' ')} ${module_name} ${reducer_name} ${json_arg}`
    console.log(proc.stdout.toString())
    kill_fn?.()
  },

  async describe(entity_type:string, entity_name:string, ...args:string[]) {
    let kill_fn = await handle_quick_start()
    await $`${STDB} describe --server ${server_address} ${args.join(' ')} ${module_name} ${entity_type} ${entity_name}`
    kill_fn?.()
  },

  async logs(...args:string[]) {
    let kill_fn = await handle_quick_start()
    let proc = await $`${STDB} logs ${module_name} ${args.join(' ')}`
    kill_fn?.()
  },

  async filterLogs() {
    // live filter vs filter live
  },

  async subscribe() {
    // live sub feed? table view? hmm
  },

  async clear() {
    delete_dir(path.join(STDB_PATH, 'control_node'))
    delete_dir(path.join(STDB_PATH, 'worker_node'))
  }
}


async function main() {
  let cmd_keys = Object.keys(cmd_obj)
  let [cmd, ...args] = process.argv.slice(2);

  if (!cmd_keys.includes(cmd)) {
    throw new Error(`invalid command: "${cmd}"`)  
  }

  // @ts-ignore
  await cmd_obj[cmd](...args)
}

await main()
