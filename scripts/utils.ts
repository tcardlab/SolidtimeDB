import { $ } from 'bun'
import { spawn } from 'child_process'
import { name } from '../package.json'
import gen_sfe from './gen_sfe'

import { appendFileSync, rmSync, existsSync } from "node:fs";

// Resolve EXE Path
import path from 'node:path';
let { STDB_EXE_PATH } = process.env
let STDB = STDB_EXE_PATH ? path.join(STDB_EXE_PATH,'spacetime.exe') : 'spacetime' // or stdb
// i could use OS specific extension for the binary, but 
// that doesn't solve the issue of package.json bin.
// i could have an os specific package.json, but thats a tad annoying...
// perhaps if i convert to monorepo, that will make more sense.


export async function isRunningByAddr (address: string, quiet=true) {
  FETCH : {/*
    let url = address.replace('localhost', '127.0.0.1')
    try {
      let res = await fetch(`${url}/database/ping`)
      if (res.status === 200) {
        return true
      }
      throw new Error('Unknown connection issue') 
    } catch (err) {
      return false
    }
  */}

  EXEC : {
    let serverRes = await $`${STDB} server ping ${address}`.quiet()
    if(!quiet) console.log(serverRes.stderr.toString())
    return !serverRes.exitCode
  }
}


// check if already started first
export async function start(local_addr:string, [skippedOut, skippedErr]=[false, false], stdb_loc=".spacetime" /* STDB_PATH already supported */) {
  // need to handle non-port addresses and testnet
  //const proc = spawn('spacetime', ['start', stdb_loc, `-l=${local_addr.replace(/https?:\/\//, '')}`]);

  const proc = spawn(STDB, ['start', `-l=${local_addr.replace(/https?:\/\//, '')}`]);
  proc.stdout.on('data', (t)=>{
    // Skip first message (its a default message)
    if (skippedOut) console.log(t.toString());
    else {
      let m = t.toString().match(/spacetime.*\n/g)
      console.log(m?.flat()?.join(''))
      skippedOut=true
    }
  })
  proc.stderr.on('data', (t)=>{
    // Skip first error (its a default message)
    let err = t.toString()

    // catching the error is iffy with standard spawn...
    if (skippedErr || !/^\n?(error|note|warning):/.test(err) ) {
      
      //console.log(err)
      /* if (err.includes('could not acquire lock')) {
        console.error('Spacetime is already in use on another port.')
        //process.exit(1)
      } */

      // error is too annoying
      //throw new Error(err)
    }
    else skippedErr=true
  })
  await Bun.sleep(500);
  //await $`sleep 0.5`

  return () => proc.kill()
}

export async function start_or_use(address='http://localhost:5000', quiet=true): Promise<(()=>void) | undefined> {

  let kill_fn;
  try {
    let res = await fetch(`${address}/database/ping`)
    if (res.status === 200) {
      console.info("Server is already up and ready!")
      return
    }
    throw new Error(`Unknown connection issue ${res.statusText}`) 
  }
  
  catch (err) {
    // If local:
    if (/^http:\/\/(localhost|\d+\.\d+\.\d+\.\d+):\d+/.test(address)) {

      // first we start and see what happens
      try {
        console.info("Attempting server start...")
        kill_fn = await start(address, [false, false])
      } 
      
      catch (err: any) {
        if (err.message.includes('could not acquire lock')) {
          // This could be avoided with a local copy of the exe
          console.error('Spacetime is already in use on another port.')

          let active_stdb_addr;
          if (process.platform === "win32") {
            // Untested, my PC is broken... 
          }
          else {
            // find port spacetime is running on
            active_stdb_addr = await $`lsof -i -P | grep LISTEN | grep "spacetime" | awk '{print $9}'`
          }
          console.info(`check: ${active_stdb_addr}`)

        } else {
          // unknown error
          console.error(err.message)
        }
      }

      return kill_fn
    }

    // If remote:
    else {
      throw new Error('Remote server is down.') 
    }
  }
}

export async function register_server(server_id:string, server_url:string, ssl=false, quiet=true) {
  // alternatively people could supply the full address url and we separate it as necessary
  let proc = await $`${STDB} server add ${['http', 'https'][+ssl]}://${server_url} "${server_id}" -d`.quiet()
  console.log(proc.stdout.toString())
  if(!quiet) console.log(proc.stderr.toString())
}


export async function register_identity(server_id:string, owner:string,  quiet=true) {
  let proc = await $`${STDB} identity new -s="${server_id}" -n="${owner}" -d --no-email`.quiet()
  console.log('Identity Set')

  if (proc.exitCode === 0) {
    // Add new ID to .env
    const [ hexMatch ] = proc.stdout.toString().match(/[a-fA-F0-9]{64}/)!
    let proc2 = await $`${STDB} identity token "${owner}"`.quiet()
    let token = proc2.stdout.toString().trim()

    let identity = `
      STDB_ID_NAME = "${owner}"
      STDB_ID_HEX = "${hexMatch}"
      STDB_ID_Token = "${token}"
    `.replaceAll(/\n\s+/g, '\n')

    // A servers identities cannot be shared atm, so we shall save
    // new ones to the specific local machine if not provided already.
    appendFileSync(".env.local", identity, "utf8")
  }

  else {
    //if(!quiet) 
    console.log(proc.stderr.toString())
  }
}


export async function gen(lang="typescript", binding_path='module_bindings', server_path="server", quiet=true) {
  // hash files check if gen is necessary?
  console.log('Generating Bindings... (First run may take a while)')

  let proc = await $`${STDB} generate --lang ${lang} --out-dir ${binding_path} --project-path ${server_path}`.quiet()
  if(!quiet) console.log(proc.stderr.toString())

  gen_sfe(binding_path)
}


export let resolve_server_address: ()=>string = () => {
  let {
    // local, development, production
    STDB_SERVER_MODE,

    // Dev (potentially remote)
    STDB_DEV_ADDRESS,

    // Prod (potentially remote)
    STDB_PROD_ADDRESS
  
  } = process.env

  let local_addr  = resolve_local_address()

  switch (STDB_SERVER_MODE) {
    case 'local': 
      return local_addr

    case 'development': 
      return STDB_DEV_ADDRESS ?? local_addr

    case 'production': 
      return STDB_PROD_ADDRESS ?? local_addr

    default: 
      // STDB Default
      return local_addr
  }
}


export let resolve_local_address: ()=>string = () => {
  let {
    // Local mode
    STDB_LOCAL_ADDRESS,
    STDB_LOCAL_PORT,
  } = process.env

  let default_addr = 'http://127.0.0.1'
  let default_port = 3000
  return `http://${STDB_LOCAL_ADDRESS ?? default_addr}:${STDB_LOCAL_PORT ?? default_port}`
}


export let resolve_module_name = () => {
  let {
    // local, development, production
    STDB_SERVER_MODE,
    STDB_MODULE
  } = process.env

  if (!STDB_MODULE) {
    // throw new Error ('ERR - Module Name Required: add a "STDB_MODULE" to .env')
    console.warn('WARNING - "STDB_MODULE" missing in .env, defaulting to package name.')
    return name
  }
  
  if (!STDB_SERVER_MODE) {
    //return `${STDB_MODULE}` // should i default to local?
    return `${STDB_MODULE}_${'local'}`
  }

  if (STDB_MODULE && STDB_SERVER_MODE) {
    return `${STDB_MODULE}_${STDB_SERVER_MODE}`
  }
}


export let resolve_server_name = () => {
  let {
    // Server Override
    STDB_SERVER_NAME_OVERRIDE,
    STDB_SERVER_MODE,
    STDB_LOCAL_PORT
  } = process.env

  if( STDB_SERVER_NAME_OVERRIDE ) return STDB_SERVER_NAME_OVERRIDE

  if ( STDB_SERVER_MODE === 'local' ) {
    //return `local:${STDB_LOCAL_PORT}`
    return "local"
  }

  return `${resolve_module_name()}_server`
}


export async function register_server_address(server_name:string, address:string, quiet=true) {

  REMOVE : { // might be a bad idea, idk 
    await $`${STDB} server remove ${server_name}`.quiet().nothrow()
    await $`${STDB} server remove ${address}`.quiet().nothrow()
  }

  let proc = await $`${STDB} server add ${address} "${server_name}" -d --no-fingerprint`.quiet() //ignore fingerprint?

  // If we don't remove, attempts to update conflicts.
  // not guaranteed to resolve if both values conflict tho...
  if (!!proc.exitCode) {
    let err = proc.stderr.toString()
    if(!quiet) console.log(err)

    if (err.includes('Server already configured')) {
      console.log('Updating existing address...')
      let proc2 = await $`${STDB} server edit ${address} -n ${server_name} -f --no-fingerprint`.quiet()
      //if(!quiet) 
      console.log(proc2.stderr.toString())
    }

    else if (err.includes('Server nickname')) {
      console.log('Updating existing nickname...')
      let isSSL = address.includes('https')
      let [_, host] = address.split('://')
      let proc3 = await $`${STDB} server edit ${server_name} -H ${host} -p ${isSSL?'https':'http'} -f --no-fingerprint`.quiet()
      //if(!quiet) 
      console.log(proc3.stderr.toString())
    }

    else {
      if(quiet) console.log(err)
    }

  } else {
    console.log(proc.stdout.toString())
  }
  
}


export async function fingerprint(server_address:string, quiet=true) {
  let proc = await $`${STDB} server fingerprint -s ${server_address} -f`.quiet() 
  if(!quiet) console.log(proc.stderr.toString())

  // Would have to share the server fingerprint (ecdsa_public_key)
  // in order for imported identities to work on diff machines
  // (i think)

  //i don't have an env var set up for that atm, so im just gonna 
  // comment it out for now
  // oh wait... publish also fails...
}


export async function publish(module_name:string, server_address:string, server_path:string, clear=false, quiet=true) {
  // Maybe i should just pass arbitrary args rather than just clear...
  // hash files check if compilation necessary is necessary?
  // would be cool to check if .wasm hash matches remote hash to see if it changed
  console.log(`Publishing "${module_name}"...`)
  let proc = await $`${STDB} publish "${module_name}" --server "${server_address}" --project-path ${server_path} ${clear ? '-c' : '' }`.quiet()  // -c option
  if(!quiet) console.log(proc.stderr.toString())
  return proc.stdout.toString()
}


export async function set_identity(server_id:string, owner: string, quiet=true) {
  console.log("Setting Identity:", owner) // check if it exists already
  let proc = await $`${STDB} identity set-default ${owner} -s ${server_id}`.quiet().nothrow()

  if (proc.exitCode === 0) {
    console.log("Identity Set")
    // If ID already exists, we don't add to .env.local
    // we prob should tho...
  } 
  
  else {
    let err = proc.stderr.toString()
    if (err.includes('No such identity')) {
      // Create new ID and save to .env.local
      await register_identity(server_id, owner)
    } else {
      if(!quiet) console.log(err)
      process.exit(1)
    }
  }
}

export async function identity_import(quiet=true) {
  let {
    STDB_ID_NAME, STDB_ID_HEX, STDB_ID_Token
  } = process.env

  // prob not ideal...
  let proc = await $`${STDB} identity remove ${STDB_ID_NAME}`.quiet().nothrow()
  if(!quiet) console.log(proc.stderr.toString()) // name is not guaranteed to exist
  let proc0 = await $`${STDB} identity remove ${STDB_ID_HEX}`.quiet().nothrow()
  if(!quiet) console.log(proc0.stderr.toString()) // might have been deleted already or never existed

  let proc1 = await $`${STDB} identity import "${STDB_ID_HEX}" "${STDB_ID_Token}" --name "${STDB_ID_NAME}"`.quiet()
  if(!quiet) console.log(proc1.stderr.toString())

  let proc2 = await $`${STDB} identity set-default ${STDB_ID_NAME}`.quiet() 
  if(!quiet) console.log(proc2.stderr.toString())
}

/*
 let proc;
  try {
    proc = await $`${STDB} identity remove ${STDB_ID_NAME}`.quiet() 
  } catch (err) {
    if(!quiet) console.log(proc ? proc.stderr.toString() : err)
  }
*/

export function delete_dir (path:string) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
  }
}