# SolidTimeDB
 
```sh
# Install
bun i

# Run STDB
spacetime start .spacetime -l="localhost:5000"     
spacetime server add http://localhost:5000 "stdb-start-server" -d   
spacetime identity new -s="stdb-start-server" -n="stdb-start-owner" -d --no-email
spacetime publish "stdb-start-db" --project-path server
spacetime start

# Run Client
bun run gen
bun start
```