
// pkg imports
import { createMemo, type Component } from 'solid-js';
import { Identity } from "@clockworklabs/spacetimedb-sdk";

// local level import
import { oneOffFind, STDB_Table } from '../../STDB/utils'

import {
  /*Tables*/  Message, User
} from '@/module_bindings'



//ignore, just playing for now
import workerUrl from "../workers/worker?worker&url";
WebWorker: {
  if (window.Worker) {
    const myWorker = new Worker(workerUrl, { type: 'module' })
    myWorker.onmessage = function(e) {
      console.log('Message received from worker', e.data);
    }
    // need cb/event-msg for when worker is ready
    setTimeout(()=>myWorker.postMessage('hi'), 3e3);
  } else {
    console.log('Your browser doesn\'t support web workers.');
  }
}


import { MapIter } from '../../STDB/MapIter'
import useSubManager from '../../STDB/subManager';
const Experiments: Component = () => {
  let subs = useSubManager()
    
  // we use <Show/> to affirm connection state:
  subs.setSub([
    "SELECT * FROM User",
    "SELECT * FROM Message"
  ])
  // else sub would err if connection failed/lagged


  // one-off find: assumes connection and identity
  // if client id updated after find started, refilter required
  let client_id=__SPACETIMEDB__.spacetimeDBClient!.identity!
  let self = oneOffFind(User, (user)=>user.identity.isEqual(client_id))
  let name = createMemo(()=>userNameOrIdentity(self()))


  // Helper Funcs
  function userNameOrIdentity(user: User|null): string {
    if (!user) return 'unknown'
    if (user.name !== null) {
      return user.name || "";
    }
    else {
      let identityStr = user.identity.toHexString();
      return identityStr.substring(0, 8);
    }
  }

  let getUser = (ID: Identity)=>{
    if(ID === undefined) return null
    let val = User.filterByIdentity(ID).next()
    return val.value;
  }

  // Derived State
  let [ msgs ] = STDB_Table(Message) //get_map(Message)
  let msgEl: HTMLDivElement;


  // Template
  return (
  <>
    <div class="message" style="display: flex; align-items: center; flex-direction: column;">
      <p>User: {name()}</p> <br/>
      <h1>MapIter Messages</h1>
      <div style="max-height: 300px; overflow:scroll; width: 300px" ref={msgEl!}>
        <MapIter of={msgs()} fallback={<p>No messages</p>}> 
          {(key, message) => (
            <div data-id={key}>
              <p>
                <b>{userNameOrIdentity( getUser(message().sender) )}</b>
              </p>
              <p>{message().text}</p>
            </div>
          )}
        </MapIter>
      </div>
    </div>
  </>)
}
export default Experiments


