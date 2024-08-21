import { Identity } from '@clockworklabs/spacetimedb-sdk';

async function createWebSocket(url: string, headers: Record<string, string> = {}) {
  if (typeof window !== 'undefined') {
    // Browser
    const headerString = Object.entries(headers)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');
    return new WebSocket(`${url}${headerString ? '?' + headerString : ''}`)
  } else {
    // Bun/Node et al.
    const WebSocket = (await import('ws')).default;
    return new WebSocket(url, {
      headers: headers
    }) as WebSocket
    /*
      idk wut the idleTimeout settings are if pings are automatic
      might need heartbeat?
      I dont think bun supports:   
      - maxReceivedFrameSize: 100000000,
      - maxReceivedMessageSize: 100000000,
    */
  }
}


// Gen token if none
let tokenUrl = new URL('identity', 'http://localhost:5000')
const response = await fetch(tokenUrl, { method: "POST" });
let token = response.ok ? (await response.json()).token : ''

const ws = await createWebSocket(
  'ws://localhost:5000/database/subscribe/stdb-start_local',
  {
    Authorization: `Basic ${btoa("token:" + token)}`,
    "Sec-WebSocket-Protocol": "v1.text.spacetimedb",
  }
)

ws.onerror = (err:any) => {
  console.error('ERROR:', err)
}

//let heartbeatInterval: Timer | null = null;
ws.onopen = () => {
  console.log('WS Connected:', Date.now())

  //heartbeatInterval = setInterval(ws.ping, 5*1e3)

  ws.send(
    JSON.stringify({
      subscribe: {
        query_strings: ["SELECT * FROM *"]
      }
    })
  )
}


let schemaUrl = new URL('/database/schema/stdb-start_local?expand=true', 'http://localhost:5000')
const schemaRes = await fetch(schemaUrl);
let schema:SchemaExpanded = schemaRes.ok ? (await schemaRes.json()) : undefined
let database:DB = new Map()


/*
  Dead End: 
    Turns out theres no way to determine the primary key of a table without bindings/hardcoding.
    That means we have no way to group inserts and deletes to form an update.
    If theres no primary key defined, then there are no update events.

    I'll make a checkpoint and pivot to hard coding
*/




import EventEmitter from './event'  
let EE = new EventEmitter()
/* EE.on('insert', (e)=>{
  console.log('insert', e)
})
EE.on('update', (e)=>{
  console.log('update', e)
}) */




import { experimental_table_update } from './table-update'
let handle_table_update = experimental_table_update(schema, database, EE)

ws.onmessage = ({ data }:any) => {
  let data_parsed = JSON.parse(data)
  let event_type = Object.keys(data_parsed)[0]

  switch(event_type) {
    case 'IdentityToken': {
      // Idk that I need to bother with this
      //console.log(data_parsed)
      let { identity } =  data_parsed['IdentityToken']
      console.log(Identity.fromString(identity))
      break
    }

    case 'SubscriptionUpdate': {
      let { table_updates } = data_parsed['SubscriptionUpdate']
      handle_table_update(table_updates)
      break
    }

    case 'TransactionUpdate': {
      let {event, subscription_update: {table_updates}} = data_parsed['TransactionUpdate']
      //console.log(JSON.stringify(data_parsed))
      handle_table_update(table_updates)
      break
    }

    default: {
      console.error('Unknown STDB-WS event type: ', event_type)
    }
  }
};

ws.onclose = (e:any) => {
  console.log('disconnected', e);
};

//ws.close()

async function* onChange() {
  let event_queue:any[] = []
  let resolveNext: undefined | ((v:any)=>void); 

  let queue = (e: any) => {
    if (resolveNext) {
      // If there is a pending generator waiting for a value, resolve it immediately
      resolveNext(e);
      resolveNext = undefined;
    } else {
      // Otherwise, add the operation to the queue
      event_queue.push(e);
    }
  }

  EE.on('insert', queue)
  EE.on('update', queue)
  EE.on('delete', queue)

  while (true) {
    if (event_queue.length > 0) {
      // If there are events in the queue, yield them immediately
      yield event_queue.shift()!;
    } else {
      // Wait for the next event if the queue is empty
      const operation = await new Promise<any>((resolve) => {
        resolveNext = resolve;
      });
      // Yield the new event
      yield operation;
    }
  }
}

for await (let op of onChange()) {
  console.log(op)
}

export {}