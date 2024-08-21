/*
  bun client/kysely-stdb/test
  
  // curl -fsSL https://bun.sh/install | bash -s "bun-v1.0.14" 
  // using bun 1.0.14 due to some weird bug importing module_bindings & stdb
  // need higher version to run bun shell tho  >= 1.1.0
  // osx no longer supported past bun-v1.1.20
*/
import { Kysely } from 'kysely'
import { SpacetimeDialect } from './dialect'
import { Message, User } from '@/module_bindings'
import { Identity } from '@clockworklabs/spacetimedb-sdk'


const Tables = {
  Message,
  User
  // Add other table classes here
}

type DatabaseFrom<T extends {[key: string]: new (...args: any[]) => any}> = {
  [K in keyof T]: InstanceType<T[K]>
};

type Database = DatabaseFrom<typeof Tables>


import {resolve_module_name, resolve_local_address} from '../../scripts/utils'
const db = new Kysely<Database>({
  dialect: new SpacetimeDialect({
    server: resolve_local_address(), //'http://localhost:5000',
    module: resolve_module_name() //"stdb-start_local",
  }),
})


async function query1() {
  const result = await db
    .selectFrom('Message')
    .selectAll()
    .execute()
  console.log(result)
}
query1()

async function query2() {
  const result = await db
    .selectFrom('Message')
    .select(['sender', 'text'])
    // BigInts and Identities may be a minor issue
    // I'd prob have to make a schema query to know wut it is...
    // properly serialized one-off queries may be supported in v0.10.0/v0.11.0
    .where('sender', '=', Identity.fromString('someIdentity'))
    .execute()

  let out = result
  console.log(out)
}


let t = db
    .selectFrom('Message')
    .select(['sender', 'text'])
    .where('sender', '=', Identity.fromString('someIdentity'))
    .compile().sql
console.log(t)


import type { SelectQueryBuilder } from 'kysely'
let asStream = <DB, TB extends keyof DB, RowType>(queryBuilder: SelectQueryBuilder<DB, TB, RowType>) => {   
  return queryBuilder.stream() as any as AsyncIterableIterator<StreamQueryRes<RowType>>
}

let query = db
    .selectFrom('Message')
    .select(['sender', 'text'])
    .where('sender', '=', Identity.fromString('someIdentity'))

for await (const row_op of asStream(query)) {
  console.log(row_op)
}



/* let Z = db
    .selectFrom('Message')
    .select(['sender', 'text'])
    .where('sender', '=', Identity.fromString('someIdentity'))
    .stream() as any as AsyncIterableIterator<{
      op: 'insert'
    }>
let forAwait() {

} */