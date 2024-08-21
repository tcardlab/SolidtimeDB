import { createEffect, createMemo, getOwner, on, onCleanup, Owner, runWithOwner, type Component } from "solid-js"
import { SpacetimeDBClient } from "@clockworklabs/spacetimedb-sdk";
import { ReactiveMap } from "@solid-primitives/map";


function sub_manager(client=__SPACETIMEDB__.spacetimeDBClient){
  let SubMap = new ReactiveMap<Owner, string[]>()

  let sub_set = createMemo(()=>{
    return Array.from(new Set([...SubMap.values()].flat()))
  })

  createEffect(on(sub_set, (aub_arr)=>{
    client?.subscribe(aub_arr)
  }))

  return {
    setSub(sub_arr:string[], useOwner=getOwner) { 
      let owner = useOwner()
      if (owner===null) {
        console.error('Bad owner, cannot dispose without valid owner.')
        throw new Error('Bad owner, cannot dispose without valid owner.')
      }

      runWithOwner(owner, ()=>{
        SubMap.set(owner, sub_arr)
        onCleanup(()=>{
          console.log('cleaned', sub_arr)
          SubMap.delete(owner)
        })
      })
    },
    checkSubs() {
      return sub_set()
    },
    checkMap() {
      return SubMap
    },
    deleteManager() {
      client_manager.delete(client)
    }
  }
}

// Unique sub manager per client
let client_manager = new Map()
export function useSubManager(client=__SPACETIMEDB__.spacetimeDBClient) {
  if (!client || !(client instanceof SpacetimeDBClient)) throw new Error(`Received bad client: ${client}`)

  let manager = client_manager.get(client) 
    ?? client_manager.set(client, sub_manager(client)).get(client)

  return manager as ReturnType<typeof sub_manager>
}

export default useSubManager