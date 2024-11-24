# SolidTimeDB

Deep reactive integration to [SpacetimeDB](https://spacetimedb.com/) (STDB) via [SolidJS](https://www.solidjs.com/). This repo is not an endorsement for anything here, just an exploration.

As a whole, this repo is a proof of concept for:
- Localizing STDB to the project level to minimize side-effects.
- Using .env to sync variables throughout the project.
- Wrapping STDB CLI with a JS package manager.
- Deeply integrating STDB with reactive systems.
- Exploring various utilities, patterns, and DX considerations (HTTP Client, Web Workers, Kysely Integration, etc.).

> [!CAUTION]
> This is not built for production nor thoroughly vetted. It is best used as inspiration.<br/>
> Development is on hold till post 1.0 while I work on other stuff...

<br/>

## Getting started:

Prerequisites: 
- [Bun](https://bun.sh/docs/installation)
- [Rust](https://www.rust-lang.org/tools/install)

```sh
bun i     # STDB will be installed locally
bun start # First run might take a bit
# Thats All!
```

<br/>

## Why Deep Integration?
<!-- 
use insert as reactive declaration of existence, while updates and deletes are implicit 
-->
Normally we use reactivity to automate updates and deletions, while initial state is defined at variable/signal instantiation. The STDB API conflicts with this notion in that it expects we handle all insert, update, and delete operations manually.

<details>
  <summary> <b>Walkthrough</b> </summary>

Manual handling works quite well in a vanilla context:
```ts
let app = document.getElementById('app')
Message.onInsert((new_msg)=>{
  app.appendChild(<p id={new_msg.id}>{new_msg.content}</p>)
})

Message.onUpdate((old_msg, new_msg)=>{
  let old_msg_el = document.getElementById(old_msg.id)
  old_msg_el.innerText = new_msg.content
})

Message.onDelete((old_msg)=>{
  document.getElementById(old_msg.id)?.remove()
})
```
(JSX used for convenience, see: [NakedJSX](https://nakedjsx.org/), [Vanilla-JSX](https://vanilla-jsx.github.io/vanilla-jsx), [ImLib](https://vanillajsx.com/), [Hono/JSX](https://hono.dev/docs/guides/jsx), [@ElysiaJS/html](https://elysiajs.com/plugins/html#jsx), [zero](https://github.com/nhh/zero), etc.)

It is not the most declarative code, you have to imagine the steps to figure out what the result should be. However, its pretty straight forward. For our own sanity, frontend developers *will* use a framework to seek out declarative, reactive patterns.


Lets now compare that to a naive reactive implementation:
```ts
// SolidJS
function Component() {
  let [messages, set_messages] = createStore({})

  Message.onInsert((new_msg)=>{
    set_messages(new_msg.id, new_msg)
  })

  // Utilize PK for targeted updates
  Message.onUpdate((old_msg, new_msg)=>{
    set_messages(old_msg.id, new_msg)
  })

  Message.onDelete((old_msg)=>{
    set_messages(old_msg.id, undefined)
  })
  
  return (
   <For each={Object.entries(messages)}> 
     {([id, val])=><p id={id}>{val.content}</p>}
   </For>
  )
}

render(() => <Component />, document.getElementById("app")!);
```
Reactivity is always overhead, but it shows quite apparently here:
- We must create a reactive object to detect updates through. There is no filtering, so this object is pure memory overhead.
- We no longer insert directly to DOM, we take a roundabout path inserting to the reactive object, detecting the change,
then updating the UI. Pure runtime overhead.
- We still do all the updates and deletions manually...
- The only benefit we gained is the declarative code, you can just look at the template to see what the result should be.

This boilerplate will have to be used everywhere if you do not take a more generalized approach. So lets see that:

```ts
// SolidJS
function useTable(table) {
  let [track, dirty] = createSignal(undefined, {equals: false});
  // We can define these events as 
  table.onInsert(dirty)
  table.onUpdate(dirty)
  table.onDelete(dirty)
  
  let table_vals = createMemo(()=>{
    // mark callback to be re-executed when signal is declared dirty
    track() 
    return table.all() 
    // ie this is recalculated every insert, update, and delete
  })
  return table_vals
}

function Component() {
  let messages = useTable(Message)
  return (
   <For each={messages()}> 
     {(val)=><p id={val.id}>{val.content}</p>}
   </For>
  )
}

render(() => <Component />, document.getElementById("app")!);
```
(This is for demonstration only, it still misses the mark on reusability and cleanup.)
- We abstract away the mess.
- We don't have to worry about the specifics of updating rows
  - ie we don't have to worry about targeted pk updates.
- Still declarative
- Unfortunately, it recalculates .all() in full every update
- Still has redundant memory...

This is a more reactive approach in that all the minutia is abstracted away. However, we can do better!


</details>
<br/>

What if it were possible to have our cake and eat it too!?
```ts
//SolidTimeDB
reactive_cache(client.db)
function Component() {  
  return (
   <For each={Message.all()}> 
     {({id, content})=><p id={id}>{content}</p>}
   </For>
  )
}

render(() => <Component />, document.getElementById("app")!);
```
If the cache itself were reactive, we don't have to worry about any micromanagement!
- minimal memory overhead
- Still declarative
- no boilerplate


<br/>


<h2>SpacetimeDB - <i>The Database-Server Hybrid</i>:</h2>



If you don't know what [SpacetimeDB](https://spacetimedb.com/) is by now, I highly recommend you acquaint yourself quickly! 

<br/>

<details>
  <summary> <b>TL;DR</b> </summary>

  SpacetimeDB (STDB) is a fullstack solution for building realtime applications at scale. It realizes this through a unique architecture that integrates server functionality and in-memory relational databases into a single, powerful entity. Built on the actor model, it handles the complexities of networking, concurrency, persistence and horizontal scaling out-of-the-box. This allows developers to focus on creating robust applications without the worry of intricate infrastructure management (No more juggling microservices, containers, or complex DevOps)!

  What really sets STDB apart is its intuitive development process. It leverages WASM modules as a language agnostic container for logic and schema, to meet developers where they are most comfortable. These modules operate on a sort of "Remote Redux" pattern that offers end-to-end type safety for seamless client-side operations. This pattern involves transactional WASM functions called "Reducers" (think enhanced stored procedures or user-defined functions), that enabling SQL-free data manipulation and querying. These reducers functions are called through RPC and automatically sync client table caches.   

  STDB streamlines the entire pipeline, offering responsive applications with unprecedented ease. But its not just about simplification - it's designed for performance and robustness so developers can build with confidence. The versatility and reliability of STDB makes it suitable for a wide range of applications, from web apps to high-performance MMOs and even mission-critical container orchestration (all things Clockwork Labs is doing right now)!
</details> 


STDB is reshaping how we build applications by letting developers focus on building functionality over architecture.

<br/>

<b>Additional Features Worth Noting:</b>
  - WAL
  - SQL API
  - Hot Updates (Update server logic without downtime!)
  - Row Level Security (<i>Coming Soon</i>)
  - Inter-Module Communication (<i>Coming Soon</i>)

<br/>

<details>
  <summary> <b>SpacetimeDB Gotchas:</b> </summary>

- Generalized relational database, but specialized web-server:
  - Can't do custom HTTP REST API. (<i>Coming Later?</i>)
  - Can't do response types like HTML. (<i>Coming Later?</i>)
  - Can't handcraft craft hyper-optimized network packets (though the default should be good enough).
  - Few network options (no UDP, WebRTC, WebTransport, etc.).
    - Those are unreliable of course and would require [workarounds](https://youtu.be/W3aieHjyNvw?si=JBL7DvpWavjAVZ-t&t=1479) to be as reliable as necessary for ones use-case.
  - No external calls. (<i>Out-Going Only - Coming Later?</i>)
  - <b>Workaround:</b> You can use a server-side client in a standard web-server to assist in making external calls or handling custom request/response types.
- No client-side prediction ATM:
  - (<i>WASM On Client - Coming Later?</i>)
  - Might be able to hack it with shared logic. 
- Ambiguous Relations:
  - Its up to the developers to use good naming conventions and documentation to know what relates to where and why.
- Can be heavy on client memory.
- Future of migrations is unclear.
- Horizontal scaling only available via their hosting service (more freedom in 4 years).
- Perhaps not ideal for specialized data types (vectors, graphs, etc.), but may be passible depending on use case.
  - Its something that has been considered, but I don't believe its on any roadmap.
- 32bit arch not supported.
  - You can strip generate code that uses Wasmtime from `v0.7.3-beta` to get an old version of STDB working.
- Insert/Update confusion -> Upsert
  - Will explain in more detail later. But you should be mindful that the same row of data could take different logical paths in clients depending on when the connected. This may be desired for alerts, but prob not for actual handling of state.
- Tables without primary keys have no update events as there is no reliable way to group insert and deletion operations.
- Typing around row instances and tables can be a little confusing, especially for generics and helper functions.
- Still on the developer to avoid using derived client values for reducer args as that may lead to concurrency issues
  - eg: `SetCountReducer.call(client_count() + 1)` if client_count was outdated, it could cause count to go backward. This is a trivial example but the purity of arguments should be kept in mind as complexity increases. Ideally such logic should be pushed to the server or at least validated there.
- Some restrictions as far as what works within modules/wasm
  - hardware restrictions mean advanced AI or anything gpu related is prob off the table atm


</details>


<br/>


## Management Features:


<h3>Project Structure:</h3> 

This repo is designed to isolate your SpacetimeDB project
to avoid polluting the global registries (Identity and Server configs being notable exceptions). There are many benefits to isolating projects in this way:
- Rather than registering all DBs under ~/.spacetime, they are now co-located under the relevant project. 
- Can easily dispose of the project, binary, and DB together.
- Can potentially commit database along side code, which might be useful for demos and bug reproductions.
- Easy to download and test projects locally with minimal side effects.
- Can run many local STDB instances simultaneously.
- Each project can trivially set an independent version(independent of TestNet and MainNet versions as well).
- Executable version is bound to the project and resolved on install for convenience. <!-- Script should prob be moved out of project as lack of oversight could lead to an exploit -->
- Some bugs are easier to diagnose with full system transparency

NOTE: Config file is still managed globally.
    
Scripts and utilities are kept within the repository rather than being bundled as a library, allowing users to modify them according to their specific needs.

The project implements a pretty standard single module, single client setup. I have not given much thought to multiples of either.

NOTE: Some utils will be reorganized in a shift to a sort of monorepo, namely `client/kysely-stdb` and `client/STDB`.


<h3>Environment Variables:</h3> 

`.env` files are used to synchronize project state through out the repo. You can read more about how bun reads `.env` files [here](https://bun.sh/docs/runtime/env#setting-environment-variables). 

I've provided a public `.env.development` as an example, you can edit it or use an different variant with higher precedence. Here are the current supported variables:
<!-- 
  NOTE: I should've stuck with .env for the demo as it has the lowest precedence
-->

.env.local for identities and other devices specific stuff
note identities are about to be reworked

<details>
<summary> <b>.env et al.</b> </summary>

```sh
# Module Name 
STDB_MODULE="stdb-start"  
# Identity will be named after this if not overridden.


# Versions
STDB_VER="0.10.0"  # Optional, otherwise it uses Cargo.toml 


# Paths
STDB_PATH=".spacetime"     # DB location (officially supported)
STDB_EXE_PATH=".spacetime" # STDB binary install location 
STDB_SERVER_PATH="server"
STDB_BINDING_PATH="module_bindings"
# TODO: STDB_CLIENT_PATH?, complicated by the fact there could be many...


# Local
STDB_CLIENT_PORT="3000"
STDB_LOCAL_PORT="5000"
STDB_LOCAL_ADDRESS="localhost"  # "127.0.0.1"  # "0.0.0.0"
# Use "0.0.0.0" for remote server. see `spacetime start -h`


# Remotes
STDB_DEV_ADDRESS="https://testnet.spacetimedb.com"
STDB_PROD_ADDRESS="https://mainnet.spacetimedb.com"


# Host Targets
STDB_CLIENT_MODE="local" # "development" # "local" # "production"
STDB_SERVER_MODE="local" # "development" # "local" # "production"
# TODO: Perhaps just use "Remotes" var name


# Server Override (for custom server name)
# STDB_SERVER = "some-custom-server-name" # Optional


# Identity Import
# STDB_ID_NAME = "<CUSTOM_ID_NAME>"
# STDB_ID_HEX = "<HEX>"
# STDB_ID_Token = "<JWT>"
# These will be auto generated if not supplied.
# TODO: Be sure to write to appropriate .env file?
```

</details>

<br/>

<b>Client Vars</b>

Env variables are embedded at compile time through Vite and accessed through `__STDB_ENV__`:

```ts
declare const __STDB_ENV__: {
  STDB_ADDRESS: string,
  STDB_WS:      string,
  STDB_MODULE:  string
};

new SpacetimeDBClient(__STDB_ENV__.STDB_WS, __STDB_ENV__.STDB_MODULE, token);
new HttpClient(__STDB_ENV__.STDB_ADDRESS, __STDB_ENV__.STDB_MODULE);
```

> [!WARNING]  
> CORS may sometimes cause issues with `__STDB_ENV__.STDB_ADDRESS`, I forget.
> I believe I usually just proxy through vite (window.location), but perhaps a better solution is in order.
> Perhaps STDB_ADDRESS=STDB_CLIENT_PORT when in development and alway proxy?


<br/>



<h3>CLI Shortcuts:</h3> 

<!-- 
  I wonder if I can take advantage of 
  prestop, stop, and poststop for anything.
-->

By leveraging the `.env` variables, we can autofill most of the arguments required for the spacetime DB CLI.

<b>Install</b>

```sh
bun i
# Triggers expected node_modules installation,
# also triggers binary installation if not installed or version is wrong

bun i --ignore-scripts
# to skip STDB install script
```

<b>Start</b>

Note: full start will generate and save identity to `.env` if not supplied.
```sh
bun start
bun run start:Full
# Initializes STDB (if not running already),
# register server and identity (every time)
# Publish module
# Generate bindings
# Start frontend

bun run start:Fast
# Ensures STDB is running (skips registrations and publish)
# Start frontend

bun run deploy
# Full start, but without frontend
# For starting up self-hosted service

bun run start:C
# Full start, but clears on publish

bun run start:FE
# Starts vite dev server alone

bun run start:BE
# Attempts to start STDB alone
```

<br/>

<b>STDB</b>

```sh
bun run gen
# Generate module bindings (assumes TS...)

bun run logs
# outputs logs

bun run sql [some_query_string]
# run sql query against db

bun run call [reducer_name] [arguments as json]
# call reducer

bun run describe [entity_type] [entity_name]
# Describe DB

bun run publish
# Publish local

bun run publish:C
# Publish clear

bun run publish:Dev
# Publish to remote Dev

bun run publish:Prod
# Publish to remote Prod
```

<b>STDB Adapted</b>

```sh
bun run clear
# Equivalent to local clear, but for ./.spacetime
# I'm worried about setting it to .env path...

bun run set-version [version] # clean pinned version only!
# Similar to upgrade, but uses .env path to install to.
# Default: attempts to install binary, update package.json and update cargo.toml to keep everything in sync.

# Using at least one flag overrides the default to opt-in:
# -b (binary - install binary)
# -s (server - update cargo.toml)
# -c (client - update package.json)

# (BEWARE: Strips .exe extension on windows for uniformity)
```

<br/>

<b>Vanilla CLI</b>

I still provided access to the local STDB instance
(assuming `./.spacetime`) via package.json "bin" option which is registered on `bun install`. You can update that value if your location is different.

NOTE: if its not immediately working run `bun link` to ensure registration.

```sh
stdb version
stdb -h
```

Here is a manual start script:
```sh
# Install
bun i

# Run STDB
stdb start .spacetime -l="localhost:5000"
stdb server add "http://localhost:5000" "localhost:5000" -d
stdb identity new -s="localhost:5000" -n="stdb-start-owner" -d --no-email
stdb publish "stdb-start-db" --project-path server
stdb generate "stdb-start-db" --lang ts --out-dir module_bindings --project-path server

# Run Client
bun scripts/gen_sfe
bun start:FE
```

<br/>


<h2>Frontend Features:</h2>

 

<h3>Unified Bindings Export:</h3>

This was added onto the bindings generation step in order to generate a single index file to export tables and reducers from.
This simply makes it easier to import the necessary classes:

```ts
import {
  /*Tables  */ Message, User, 
  /*Reducers*/ SendMessageReducer, SetNameReducer
} from '@/module_bindings'
```
vs the old method:
```ts
// Tables
import Message from '@/module_bindings/message';
import User from '@/module_bindings/user';
// Reducers
import SendMessageReducer from '@/module_bindings/send_message_reducer';
import SetNameReducer from '@/module_bindings/set_name_reducer';
```

Additionally, I have added a vite/ts path alias for the root directory `@/` to make accessing `module_bindings` trivial anywhere. Auto import could be set up as an alternative that would be more convenient, but more "magical" (which I don't usually like).

> NOTE: because it generates an `index.ts` file, you cannot name a Table "index", as their names will conflict (or edit the `gen_sfe.ts` script to generate to a different file/location as a workaround).



<h3> Auto-Register Bindings:</h3>

  Helper functions for binding registration are provided by `gen_sfe.ts` through the generated `module_bindings\index.ts`:

```ts
// You can register manually:
import { registerArr } from '@/module_bindings'
registerArr([someReducer, someTable]) // A selection
// Capable of discerning table and reducers automatically

import * as Bindings from '@/module_bindings'
registerArr(Object.values(Bindings)) // All


// Or register all automatically:
import { register } from '@/module_bindings'
await register() // works well with top level await.
```

Register should be called very early as it is required to use any table or reducer. I run it top level in `STDB/init.ts` (for colocation) where it executes on first import. As it is directly imported to `src/index.ts`, you can effectively imagine it runs there.

> NOTE: might switch to `registerArr(Object.values(Bindings))` to run synchronously within `init_stdb()`.




<h3>HMR:</h3>

Because vite uses hot module replacement (HMR), which swaps code in the running application, we need to add some handling to clean up any persistent side-effects and potentially re-trigger any initialization side-effects. Because I am just focusing on SolidJS at the moment, we can utilize its `onCleanup()` method to handle the cleanup for us (rather than using a more agnostic vite base solution). However, this means that HMR helpers must be executed under a SolidJS context/root.

Without HMR helpers, you will have a build up of outdated events and memory that as you edit you codebase.

<br/>
<b>Connection Helper</b>

```ts
hmrConnect({
  client,
  once({token, identity}) {
    console.log('This will run only once.')
    console.log({token, identity})
  },
  perLoad({token, identity}) {
    console.log('This will re-run each save.')
  },
  onError(err) {
    // invalid token, failed to connect, once/perLoad errors, etc.
    console.log(err)
  }
})
```

<br/>
<b>Client Helper</b>

With `hmrSafeClient()` we can use reducers and tables without worry of memory leaks as we code. It wraps `client.on()` which is what `Reducer.on()` et al. use, ensuring they are cleaned. It also wraps the tables individually via `hmrSafeTable()` which itself wraps `Table.onInsert()`, `Table.onDelete()`, and `Table.onUpdate()`. 

```ts
hmrSafeClient(/*Can pass specific client if desired*/)
```


<br/>
<b>HMR Debugger</b>

When in development mode, STDB_Event_Debugger will look alert you to any events that persisted between saves (ie cleanup failed).
```ts
STDB_Event_Debugger()
```
> NOTE: it only checks table events at the moment... I need to add support for client.

<br/>

<h3>Initialization Helper:</h3>

`STDB/init.ts` provides some useful initialization boilerplate and helpers.
register()

The main export is `init_stdb()`, which handles:
- Initializing a client using `__STDB_ENV__` values
- Enabling solid based `reactive_cache()`
- `onSafeConnect()` to validate the token and identity (else reconnect)
- `handleDisconnect()` uses jittered exponential backoff to attempt reconnect
- register client specific ClientVals


The following helpers are provided for the singleton client:<br/>
`get_token()`, `get_identity()`, `get_client()`

The following signals are also provided for client specific values:
```ts
interface ClientVals {
  token: Accessor<string|undefined>
  identity: Accessor<Identity|undefined>
  live: Accessor<boolean>
}

let {token, identity, live} = useClientVals(/*optional client of choice*/)
```
<br/>

<h3>HTTP Client:</h3>

I have provided an HTTP client for SpacetimeDB servers. 
The property call pattern is similar to the api path, the only notable exception is when post and get share the same endpoint, in which case an extra property is used to differentiate the call method (`some.path.get()` vs `some.path.post()`).
See STDB docs for the available endpoints - [/identity](https://spacetimedb.com/docs/http/identity), [/database](https://spacetimedb.com/docs/http/database), [/energy](https://spacetimedb.com/docs/http/energy). I have provided some examples of common endpoints below:


```ts
let STDB = new HttpClient(host, module_name)
// You may provide a token if specific authorization is necessary

// */database/call
let create = await STDB.database.call('send_message', ['Hello from http'])
console.log('Call Res: ', create)

// */database/sql
let sqlQuery = await STDB.database.sql('SELECT * FROM Message')
console.log('SQL Res: ', sqlQuery?.[0].rows.map(v => v[0]))

// */database/schema
let schema = await STDB.database.schema();
console.log('Schema Res: ', schema);
```

> NOTE: I was too lazy to do all the typing by hand and had AI help me, so if theres an issue... don't blame me 😉

<br/>

<h3> Schema-Value Parser: </h3>

Small multi-step recursive parser to convert SpacetimeDB JSON data into properly typed Data (Identities, Addresses, BigInts, sum types).
```ts
convertValue(stdb_schema, value, typeSpace || [])
```

You can test this by running:
```sh
bun ./client/kysely-stdb/parse
```

> NOTE: To generate table bindings, one could probably modify it a tad to write static types to result and just remove the actual value stuff. Then use some lang specific type lookup tables, table/reducer formatter, and handle auxiliary enum / structs in typespace.

<br/>

<h3>WS Client:</h3>

A minimal implementation of a JSON based WS client for STDB.
It does not require bindings, however, if you want to listen to updates, you have to hardcode the primary key. It uses the aforementioned Schema-Value Parser to ensure proper typing.

unfortunately, I have yet to packaged this up nicely,
however you can test it by running:
```sh
bun ./client/kysely-stdb/ws
```

Without subscription specific bindings/schema, you must subscribe to the full row (ie `SELECT * FROM ...`). This is because its harder to find the index of the primary key off global schema. This could probably be fixed (at the cost of a duplicate query as the sql api provides schema), just didn't think about it at the time. (probably makes more sense to store the map caches under a query string key rather than the table name or use custom names).


This implementation uses a custom `table_updates` handler.
The official implementation performs a preprocessing step to find updates by associating deletes and inserts through pk value in a map.
Then, it iterates over the operations types individually. My method assumes the row-ops come in presorted and leverages that to identify updates, emitting events as soon as it has verified what the row-op is.


Another difference between this implementation and the production version is that I only use the primary key (if given) as the key to the row. The production version uses the whole row in a serialized form. Similarly I use the whole row if no primary key is provided.

<br/>

<h3>Kysely Helper:</h3>

Because STDB is aiming for Postgres parity, we can adapt the existing postgres kysely bindings to build a SpacetimeDB dialect (`SpacetimeDialect`). We simply make queries over the http sql endpoint and use the given schema to parse the data via the Schema-Value Parser.

> NOTE: STDB doesn't implement the totality of postgres yet. Its still up to you to know what SQL is permitted.


First, we must extract typing from our bindings:
```ts
// From manual selection:
import { Message, User } from '@/module_bindings'
const Tables = {
  Message,
  User
}
type Database = DatabaseFrom<typeof Tables>


// From all table bindings:
import * as Bindings from '@/module_bindings'
type Database = DatabaseFromBindings<typeof Bindings>
```

Next we register kysely:
```ts
// The following will not work due to CORs
import { Kysely } from 'kysely'
import { SpacetimeDialect } from '../kysely-stdb/dialect'

const db = new Kysely<Database>({
  dialect: new SpacetimeDialect({
    // may need to proxy server on browser due to cors...
    server: __STDB_ENV__.STDB_ADDRESS, // window.location
    module: __STDB_ENV__.STDB_MODULE
  }),
})
```

Finally, we can use Kysely SQL type-inferencing and get properly typed query results:
```ts
async function query() {
  return await db
    .selectFrom('Message')
    .select(['sender', 'text'])
    .execute()
}

let result = await query()
console.log('SQL:', result)
```

<br/>

<h3>Subscription Manager:</h3>

Its necessary to manage the subscriptions that various live components may need over time. The subscription manager leverages the SolidJS ownership model to define, update, and clear subscriptions locally. These local subscripts are merged into a global set. If a difference is detected in the set, it automatically triggers a resubscription.

The practical use is that each component lists its subscription dependencies. When unmounted, those subscription dependencies are dropped (if unique).

```ts
let subs = useSubManager(/*optional client of choice*/)
subs.setSub([
  "SELECT * FROM User",
  "SELECT * FROM Message"
])
```

> NOTE: You probably don't want to abuse this as resubing may be taxing on both server and client.

<br/>










wrappers assume you are using stdb within a solid js context. otherwise is in a wrapper may not be the best idea… 
should check that onCleanup doesn’t throw and maybe add a backup normal hmr wrapper

i could emit from a different location
or rather emit twice and have one that sends rowPK to filter?








<h3>Reactivity:</h3>



STDB and reactivity both operate on the premise of derived client state, which makes for a great match.





- Why reactive clients are great for STDB:
  - derived state eliminates weirdness of execution order and different logical paths for same data
    - reducer updates between tables don't guarantee ordering.
    - data that is insert to some may be update to others. these are different logical paths.
- Where STDB and reactivity conflict:
  - diffs
  - reactivity operates on setting a source while stdb operates on triggering reducers
    - eliminate the set portion of reactivity and lose a lot of the ergonomics 
  - if you don't deeply integrate reactivity with stdb in some way, you are still handling state like a vanilla app
    - with reactivity, update and delete should be automatic
    - see discord msgs

  - Reactivity:
  - Subscription manager
  - reactive client connection properties
    - useful for guarding on connection state
  - Reactive client Cache
    - Create filter for reactive rows or 
    - onUpdate and onDelete are no longer necessary to micromanage
  - Reactive-filter
    - filter a table as the data comes in
    - refilter if the filter parameters or function change
  - oneOffFind: searches cache and incoming messages
    - might make even more reactive... tbd
  - Map-iterator Element
    - can iterate directly over the table row instances
    - I don't necessarily recommend it, but its an option 

- ✅ createMutable is being deprecated in Solid v2, need to update to read/write segregation...

might be worth adding signal wrapped row option

- ✅ cleanup reducer events

- ✅ make reactive:
  - ✅ get_identity / global_identity
  - ✅ get_token / global_token
  - ✅ is_live or connected thing?



- ✅add stdb bin path to package.json
- ✅only delete *_node dirs on clear
- ✅switch back to .env and guild people to use .env.development or prod for their use-cases? or .env.development.local?
- ✅identity management and server owner situation is kind of a mess
- ✅implement SafeRow type, helper row_ref(), and ensure oneOffFind is safe.
- ✅Fix connection:
  - ✅handle reconnect after disconnect/interruption (needs improvement)
  - ✅exponential backoff?
  - ✅use module name in local-storage token key? (clear priors would be less relevant)
  - ✅review token handling etc. (onSafeConnect handles token but HMR doesn't leading to unexpected behaviors)
- ✅Improve STDB_Table:
  - ✅might not be necessary to listen to every insert on init.
  - ✅wait for on init state-sync to be done and derive after.
  - ✅this is an opinion, so it should be optional.

<br/><br/>


<h3>Hooks:</h3>

  - Hook Wrappers:
    - onChange
      - its very common that deletions and falsy updates can be logically grouped
        - Example: deleting a user and logging a user out will both remove them from the list of online players
      - likewise inserts and truthy updates can often be logically grouped. 
        - aka upserts
      - onChange exposes all actions (insert, update, and delete) so that you can efficiently group your code under one callback rather than split it up among server with redundant logic.
    - onUpsert
      - This is useful to guarantee identical execution between clients subscribing at different times.
      - what might be an update for someone currently subscribed will be an insert for someone who subscribes later.
      - rather than set up two callbacks manually, this unifies then to ensure the same path of execution followed by both users.
    - onInsert, onUpdate, onDelete hooks for sake of uniformity.



### Why Upsert
upsert helper for shared insert update side-effects
 
There is an interesting oversight in the client reproducibility in STDB state on clients.
changes to state post subscription are received as updates
but someone subscribing later will receive those state changes as inserts

what this means is that the same state has taken a different path through on two clients
if the programmer used bad patterns this disparity could lead to different client states.

```
let side_effects = ()=>{/* side effects */}
Table.onInsert((new_item)=>{
  // call side-effects
  side_effects()

  // create things 
})

Table.onUpdate((old_item, new_item)=>{
  // call side-effects
  side_effects()

  // mutate things
})
```

vs


```ts
Table.onUpsert(()=>{/* side effects */})
Table.onInsert((new_item)=>{
  // create things 
})
Table.onUpdate((old_item, new_item)=>{
  // mutate things
})
```


### Why onChange

The four cases can often be treated two depending on truthiness




<br/>


## Glaring Issues:


### Cleaning Single Row References

To preface, there are four things at play here:
1. The original STDB TS SDK API:
    - Ideally we want to preserve this.
2. How reactivity wraps things:
    - Reactivity only detects changes within its wrapper, not on itself. This is why we use .value and getters()
    - Potentially in conflict with #1
3. How we signal row deletion
4. How we track single row references (if at all).

You will see how each of these comes into play as I explain the issue and solutions.


#### The Problem

At the moment, SolidTimeDB creates a reactive map that contains reactive rows. This works great for derived values, but breaks down 
once you extract to a single row or property to a variable.
```ts
// This only runs once.
let some_row = SomeTable.all()[0];

// Derived signal will be recalculated frequently.
let some_row = ()=>SomeTable.all()[0];

// Memo will be recalculated frequently,
// but may prevent irrelevant downstream effects.
let some_row = createMemo(()=>SomeTable.all()[0]);
```
Recalculating something that is expensive or that seldom updates
may not be the desired behavior. 







The Cost of Single Rows:
The row itself is reactive
but deletion is an action performed on the parent (Map)
if you have extracted a row to a variable, it will outlive its cached existence.
this is not great for derived  state, and has a few options:
get row and set properties to undefined onDelete
never extract a row, just filter down to 1 row
add a listener first that row or all single rows to update to undefined when its deleted from table
use createEvent(on()) row to watch for properties to be deleted?
this fact adds overhead that builds…




create a global map for shared single row references.

this will have a single event watcher that checks delete rpks against the map and sets the single row reference to undefined when deleted.
this is an issue with truing to match the stdb api.
if i used signals, you could set the row itself to undefined.
but that would feel weird?

map.get(row_pk)().column()

map.get(row_pk)().column
hmm idk


Solutions:

- maintain current api
oh right rpk changes between updates 

- use signals
```ts
type RPK = string
interface Entry {
  rpk
  setter
  /* cols… */
}

let instance = new Map<RPK, Accessor<Entry>>
let row = instance.get(rpk)
let value = row()['Some_Column']

onDelete
  row()['setter'](undefined)
```
```ts
type RPK = string
interface Entry {
  rpk
  setter
  /* cols… */
}

let [getter, setter] = createSignal()
let row = (...args) => {
  if (args.length) return setter(...args)
  return getter()
}

let instance = new Map<RPK, Accessor<Entry>>
let row = instance.get(rpk)
let value = row()['Some_Column']

onDelete
  row()['setter'](undefined)
```

- deeper proxy 
```js
type RPK = string
interface Entry {
  rpk
  setter
  row?: { // or "value"
    /* cols… */
  }
}

let instance = new Map<RPK, Entry>
let entry = instance.get(rpk)
let value = entry.row['Some_Column']

onDelete
  entry.row = undefined 

// up to dev to clean up references on falsey row
// to row so gc can claim old entries.
```


<br/><br/>

### Glaring Issue #2:

My goal with the STDB Filter was essentially to create a virtual table. With this, I thought I needed a row key like how the official TS SDK defines tables. but I came to the realization that by solidifying the tables, updates are handled automatically for me since filtered rows reference the same table row objects. Ultimately, I should be able to simply replace the Map with a Set and remove rowPk from the row object (this hack is how I was passing the row keys).

<details>
<summary> Train of Thought: </summary>
rowPk is essentially the value of the row. If the row stores a large value the pk is large.
I realized a map that uses pk as the key, stores the row as a value, and holds the pk in the value (to create tables elsewhere) is essentially triple the memory!<br/><br/>

Thinking about how to fix this:<br/>
The key can use the primary key value of the table rather than the full serialized row (I’ve implemented this in my JSON based ws version, it’s harder for the sdk to do as it’s dealing with potentially complex values that it would have to extract from the binary. that being said, they could also stringify the parsed pk as I do. its low overhead as the value has to be parsed anyway).<br/>

I want to eliminate rowPk from the rows itself. The reason it’s included is so I can use the key in the filter table. realizing its not strictly necessary to use the same keys I thought I could just use an increment value in the rows and pass that. then I thought maybe I can just pass the rows reference (ie itself) as the key. a Map whose key is a reference to the value, is simply a Set. in other words, a key is not necessary at all!
</details>
<br/>


I am now left with an interesting decision. do I use an explicit Set that would break the API or do I use Map with row ref keys? hmm 
the down stream effect here unfortunately is that keys between source and filter will no longer match…

I might just have to settle using array form like .all() and […set]


<br/><br/>

## Assumptions/Disclosures:
- I haven't considered multiple client workspaces
  - Reasonable that there may be an admin client/dashboard and public client
- I haven't considered multiple client languages
  - Shouldn't be an issue aside from where bindings are saved... 
- Minimal consideration toward multiple runtime clients (not supported atm) aside from webworkers.
  - This will be supported in v0.12.0 so I will have to think about it soon
- I haven't considered multiple modules
  - Inter-Module Communication is coming along with multi-client support, so this is something to think about.
- No real consideration towards auth
  - About to be reworked by by STDB team to use OIDC anyway (I imagine this will be much cleaner and more extensible)
- Assumed only one client/user identity
  - multi-client could complicate this
- I have not considered running server-client / proxy server along side STDB
  - This is probably important to think about as any 3rd party interactions and requests will likely be done this way.
- I Have barely considered shipping to prod
  - I'm just playing around

<br/><br/>

## To Do:
- auto import? (might be useful for bindings, helpers, and solid stuff, tho I have mixed feelings about magic.)
- WebWorker helper for multiple subscription sets, threading, relieving main thread from burdensome subscriptions/resubs.
- deferred & await:
  - deferred callback helper to ensure things run in appropriate order between tables inserts/updates. 
  - await some condition before executing callback (ensure all items loaded before doing something)
  - I'm not sure these jive well w/ reactive paradigm
- emit change events on filter set tables?
  - watching table directly requires filtering the row at least twice
  - have to emit on set cuz the reactive primitive hole (catch watch diffs)
- oneOffFind - support signal filter to update filter condition
  - might be worth using stdb_filter at that point...
- cleanup variable naming
- expose frontend port to `__STDB_ENV__`as we need to proxy http requests through there. location.origin prob works fine in most cases tho.
- attempt to grab stdb binary from a cache dir first (good for when you build ur own, are ahead of release, offline, etc.)
- vanilla js hmr example, save effects under the module name and clear b4 that module is unloaded.
  - we utilize solids cleanup method, which is necessary for runtime operation too.
  - But vanilla js obviously doesn't have a cleanup method, so we need a diff approach... hence module names/paths
- indexDB storage helper (just for fun)
- track client events in STDB_Event_Debugger
- convert to monorepo:
  - /
    - packages
      - STDB
      - stdb-parser
      - kysely-stdb
      - ws
      - scripts?
        - fix bin .exe handling
    - client
    - module_bindnigs
    - server
- update demo (Multi-User Todo MVC):
  - todoMVC x framework Bench mark
    - Manual actions:
      - add labeled todo item
      - toggle item completion
      - update label
      - delete item
      - filter (none, completed, incomplete)
    - automated actions:
      - insert 100 items at once
      - trigger 100 single item inserts
      - delete 100 items at once
      - trigger 100 single item delete
      - complete all
      - uncheck all
      - clear list
      - etc.

<br/><br/>

## Stretch Goals:
- Might be neat if Reactive-filter could be a "virtual table" on the client and match the api of official stdb tables (filter_by_* etc.)
  - would have to generate a lot of methods tho... kinda tedious
- Implement examples:
  - Cursor Example
  - BitCraft-Mini in Typescript
  - r/place or Million Checkboxes
  - WebRTC Server
  - Mini-Discord
  - CRDT App (collab canvas or text editor)
  - DB Dashboard / Studio
- STDB-Patterns
  - App to explain and demonstrate common patterns and use-cases.
  - [tutorialkit](https://tutorialkit.dev/)
  - [eraser](https://www.eraser.io/)
  - [VecDocs](https://github.com/tcardlab/VecDocs) (private)
  - [STDB-Patterns](https://github.com/tcardlab/STDB-Patterns) (private)
