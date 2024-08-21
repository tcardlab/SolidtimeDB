# SolidTimeDB

This repo is a proof of concept for:
- Deeply integrating STDB with reactive systems 
- Wrapping STDB CLI with a JS package manager
- Using .env to sync variables throughout the project
- Localize STDB to the project level to minimize side-effects

This has not been tested in production nor thoroughly vetted. I have not tried windows (recently) nor linux. 

> [!CAUTION]
> Use at your own risk (should be pretty minimal though)!

## Getting started:
```sh
# If bun is not installed:
npm install -g bun
# more info here: https://bun.sh/docs/installation

bun i
bun start
# first run might take a bit

# Thats All!
```





## .env
```sh
# Module Name (by default server and identity will be named after this too)
STDB_MODULE="stdb-start"


# Paths (add bindings path?)
STDB_PATH=".spacetime"     # DB location (officially supported)
STDB_EXE_PATH=".spacetime" 
STDB_VER="0.10.0"          # Optional, otherwise it uses Cargo.toml 
STDB_SERVER_PATH="server"  # do i need a client path?
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
```


<!-- ## Commands
this is basically what it does under the hood
```sh
# Install
bun i

# to skip stdb install script
bun i --ignore-scripts

# Run STDB
spacetime start .spacetime -l="localhost:5000"     
spacetime server add http://localhost:5000 "stdb-start-server" -d   
spacetime identity new -s="stdb-start-server" -n="stdb-start-owner" -d --no-email
spacetime publish "stdb-start-db" --project-path server

# Run Client
bun run gen
bun start
```
 -->


<!-- 
covers how to run the local executable manually
use stdb raw 
```sh
.spacetime/spacetime version

# or temporarily set path
export PATH=".spacetime/spacetime":PATH # bash/zsh
$env:Path = "${destinationPath}/spacetime.exe;" + $env:PATH  # powershell

spacetime version
```
I don't want to be so aggressive as to permanently update the path.
So, I'll instruct people to on how to path the env temporarily if they
want to manually run commands. 
 -->

<!-- 
this can be deleted. just different ways to target the local exe
I have to target the correct exe to run, prob two ways to do it
```ts
// Use given path or default to global def
let STDB = STDB_EXE_PATH ? path.join(STDB_EXE_PATH,'spacetime') : 'spacetime'
$`${STDB} some-command`

// I like this but it would mess with any relative path based arguments...
// i could resolve them to absolute path, but idk...
let STDB_DIR = STDB_EXE_PATH ? path.join(STDB_EXE_PATH,'spacetime') : '.'
$`./spacetime some-command`
  .cwd(STDB_DIR)
```
 -->


## Features Overview:
- Management/Developer Experience:
  - 2 line start `bun i; bun start`
    - locally installs stdb binary for you
  - Contained/disposable database and Executable
    - Can potentially commit your database along side code, which might be useful for demos and bug reproductions. 
    - Rather than registering all DBs under ~/.spacetime, they are now co-located under the project
    - Easy to download and test projects locally without side effects
    - Each projects can trivially set an independent version
    - Executable version is bound to the project and resolved on install for convenience
    - NOTE: Unfortunately config is still managed globally
  - Unified env to manage settings
  - Common CLI command replacements:
    - prefilled addresses and module names
    - utilizes given stdb version
  - Version command
    - updates package.json, Cargo.toml, and the executable to keep everything in sync.
    - NOTE: operates on pinned versions
  - Automatic Identity Loader and Env Backup
- Frontend:
  - Generates unified bindings export
  - Auto-register all bindings
    - Can override
    - Capable of discerning table and reducers automatically
  - HMR
    - wraps client, tables, and reducers for HMR support (prevents mem leak between updates)
    - HMR connection helpers and debuggers
  - HTTP Client
  - Kysely SQL Type-Inferencing and Querying
    - NOTE: STDB doesn't implement the totality of postgres yet. Its still up to you to know what SQL is permitted.
  - Init helper - determines if localStorage et al. are dirty from other projects.
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


## Uncertainties:  
- best way to init .env?
  - config file
  - getting started readme 
  - install.ts section (if env not prod, gen defaults)
  - commit an .env.local? 
    - [neat this is supported by bun](https://bun.sh/docs/runtime/env#:~:text=.env.local)
- I heavily utilize Solids onCleanup to detect local hmr updates. Im not familiar enough with vite hmr to know if there is a more agnostic solution.
- not sure if theres a specific way we should handle optimistic updates
- not sure the best way to suspense necessary updates
- etc.


## Assumptions/Disclosures:
- I haven't considered multiple client libraries/workspaces
- Minimal considered multiple runtime clients (not supported atm)
- I haven't considered multiple modules
- no real consideration towards auth
- Assumed one client/user identity
- have barely considered shipping to prod

# To Do:
- ❌ WS reconnect helper
  - i think i'm just blocked on this? SDK may need fix.
  - exponential backoff?
- Webworker helper for multiple subscription sets
- indexDB storage helper
- ✅ createMutable is being deprecated in Solid v2, need to update to read/write segregation...
- immediately:
  - ✅ update package.json on version update
  - ✅ download stdb exe on install (need to identify version)
    - ✅ prob best to grab from cargo
    - ✅ or maybe .env? hmm
  - ✅ ensure proper exe is used in cli commands
    - ✅ properly warn users about using stdb raw
  - ✅ finish one-off query typing
  - ✅ http client
  - deferred & await
    - I'm not sure these jive well w/ reactive paradigm
- ✅ move deps to client
- ✅ Bump version and ensure proper exe is used
- ✅ local clear script
- ✅ SQL Response Parser
- ✅ clean up vite proxy implementation
- ✅ independent ws solution
- ✅ HMR helper (saves currently break WS, subscriptions, and cache)
- Features in depth section on readme
- emit change events on filter set tables?
  - watching table directly requires filtering the row at least twice
  - have to emit on set cuz the reactive primitive hole...
- auto import
- oneOffFind, handle filter updates
  - might be worth using stdb_filter at that point...
- ✅ make reactive:
  - ✅ get_identity / global_identity
  - ✅ get_token / global_token
  - ✅ is_live or connected thing?
- ✅ subscription manager:
  - ✅ without multi-client support, its necessary to
    manage the subscriptions that various live components
    may need.
  - ✅ use a map, where comp ref is key and query str is value
    - could use counter for key if necessary
  - ✅ get the Set of all query values on map updates
  - ✅ onCleanup(), remove item from map.
- cleanup variable naming
- ✅ cleanup reducer events
- expose frontend port to `__STDB_ENV__`as we need to proxy http requests through there. location.origin prob works fine in most cases tho.
- convert to monorepo?
  - /
    - packages
      - STDB
      - stdb-parser
      - kysely-stdb
      - ws
    - client
    - module_bindnigs
    - server
- update demo:
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

## Stretch Goals:
- Might be neat if Reactive-filter could be a virtual table on the client and match the api of official stdb tables
  - would have to generate a lot of methods tho... (not hard, just tedious)
  - idk, I'm on the fence
- implement examples
  - multi-user todo mvc
  - cursor example
  - bitcraft mini in Typescript
  - r/place
  - webrtc server
  - mini discord chat
  - crdt app (collab canvas or text editor)
  - DB dashboard 
- STDB-Patterns 
  - an app to explain and demonstrate common patterns and use-cases
  - https://tutorialkit.dev/
  - https://www.eraser.io/
  - https://github.com/tcardlab/VecDocs (private)
  - https://github.com/tcardlab/STDB-Patterns (private)
- idk make a game?


# Notes:
- Reactivity's Missing Primitive (Diffs):
  - reactivity watches a whole source for changes, you cannot watch for arbitrary, deep changes individually
    - you could watch every deep value, but that is overkill and lots of book keeping
  - can alter of a diff at set time which is not particularly reactive...
  - can diff after set which is potentially redundant...
  - new primitive may be required
  - Example: in this repo I cannot use any reactive primitives to trivially determine what row was updated let alone how. Its easier to simply rely on the the spacetimeDB event system which already operates on row diffs. We are fortunate to have a way out with set-time events (onInsert, onUpdate, onDelete), but I do think points to a hole in the primitives modern reactive frameworks implement. I don't think its necessarily trivial to fill either...
- Why Remote Redux Pattern is Better than Remote Signals:
  - Signals operate on setting a source value and communicating side-effects.
  - If the server receives a new value, it can be difficult to decipher:
    - What change was made (might have to diff complex values)
    - Why was the change made (have to infer based on what the change was)
      - If you send a key along with the value, thats pretty much redux
    - Is this valid (Given the inferred reason must check its validity)
  - With remote redux, you are essentially making RPC calls. 
    - the change and reason that is made is inherent to the specific reducer (there is no inference)
    - The validity is also tightly coupled to the specific function.
  - Derived Values on the Server:
    - if not done transitionally, could result in race-conditions, inconsistencies, and more if clients depend on those values to make future updates.
  - Effects on the Server:
    - not inherently bad, can reduce book keeping and redundant calls
    - what you specifically do with the effect is probably more important and hard to generalize any ruling on it.
  - Distributed Environments:
    - One of the great things about the redux pattern is the ease of time-travel and rollbacks.
    - while not impossible, rollbacks in a signal/side-effect system might get complicated
  - I think using signals and effects on a server is fine, but trying to communicate signals to clients prob wont hold up well for larger and more demanding use-cases.
  - (It does sem like a fun project tho, distributed, transactional, remote signals with rollback etc.)
    - (debugging that seems like a nightmare lol)
- I want to keep scripts and other management scripts in the repo (rather than bundled as a library) so people can easily modify them for their particular needs.
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