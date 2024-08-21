/*
 NOTES:
  - why use web worker?
    - might want to offload expensive tasks
      - serialization
      - filtering 
      - subbing & resubbing
    - init subscribe fetch is one big chunk
      - might not want to block main on its serialization
    - volatile subscription
      - if a particular is updated a lot, might want to isolate it
    - parallelization
    - if you are filtering data on client,
      a large chink of updates may not be immediately relevant 
      to the host. you can send the minimally relevant content
      to minmax main thread work.
  - need to pass token and maybe id to worker
  - prob init everything after receiving go 
    ahead from client message from
  - init message cam prob be automated away
    - stdbWW({script, token, id})
    - stdbWWInit((token, id)=>{ })
  - Data Sharing:
    - Host <=> indexdb <=> WW
      - shared db
      - prob not great for fast paced things
    - Host <=> msg <=> WW
      - update query => (resub)
      - request current data <=> row array
        - with some filter perhaps
      - relevant updates <= live_filter
      - watch row <=> row update
      - reactivity over msg?
        - if you get a single row or set of rows
          updates to them should automatically
          be applied to host copy.
    - sharedArrayBuffer (NOTE: requires same origin)
      - idk
      - could stream ws arrayBuffer to host,
        but at that point may as well just use multiple clients
  - should prob have a vanilla example 
    and a separate solid js one.
  - i could maybe create some sort of remote table class
    and if that is passed to STDB_Table, perhaps I can add
    a special setup to auto sync with WW.

I have limited time so i might as well just focus on the
solid JS implementation over vanilla.
================================================

// perhaps make them STDB_Tables by default
let {tableA, tableB, tableC} = await STDB_WW({
  tableA: 'query',
  tableB: 'query',
  tableC: 'query',
  // I wouldn't know what tables to expose otherwise.
}) // optionally, send unique token and id.
// well a notable difference is that the filter is on the ww...
// i think i'll have to use another live_filter ?

// no idea how to type this...
*/

//@ts-ignore
self.isServer = true;
self.window = self

//@ts-ignore
self.localStorage = {
  storage: new Map(),
  getItem: (k:any)=>self.localStorage.storage.get(k),
  setItem: (k:any,v:any)=>self.localStorage.storage.set(k,v),
  removeItem: (k:any)=>self.localStorage.storage.delete(k)
} as any as WindowLocalStorage ;


import { createRoot } from 'solid-js'
let { init_stdb } = await import('../../STDB/init')

let main = ()=>{
  console.log('webworker')
  init_stdb()

  onmessage = (e) => {
    console.log("Message received from main script");
    const workerResult = `Result: ${e.data+'!!!'}`;
    console.log("Posting message back to main script");
    postMessage(workerResult);
  };
}

createRoot(main);




// https://web.dev/articles/indexeddb
/* 
let db: IDBDatabase;
const request = indexedDB.open("ModuleName");
request.onerror = (event:any) => {
  console.error(`Database error: ${event.target.errorCode}`);
};
request.onsuccess = (event: any) => {
  db = event.target.result as IDBDatabase;

  const insert = db.transaction(["insert"], "readwrite");
  insert.oncomplete = (event) => {
    console.log("row(s) inserted");
  };
  insert.onerror = (event) => {}

  let insert_arr: any[]=[]
  const table_insert = insert.objectStore("SomeTable");
  insert_arr.forEach((customer) => {
    const request = table_insert.add(customer);
    request.onsuccess = (event) => {
      console.log("row(s) inserted");
    };
  });
}; 

// This event is only implemented in recent browsers
request.onupgradeneeded = (event:any) => {
  // Save the IDBDatabase interface
  const db = event.target.result as IDBDatabase;

  // Iterate over tables
  const table = db.createObjectStore("SomeTable", { keyPath: "row_pk" });
  table.createIndex("row_pk", "row_pk", { unique: true });

  table.transaction.oncomplete = (event) => {
    // Store values in the newly created objectStore.
    const SomeTable = db
      .transaction("subscribe", "readwrite")
      .objectStore("SomeTable");

    let table_data:any[] = []
    table_data.forEach((row) => {
      SomeTable.add(row);
    });
  };
}; 


const pk_index = objectStore.index("name");

index.get("Donna").onsuccess = (event) => {
  console.log(`Donna's SSN is ${event.target.result.ssn}`);
};
*/