import { CompiledQuery, DatabaseConnection, Driver, QueryResult } from 'kysely'
import type { SpacetimeDialectConfig } from './config'

import { convertValue } from './parse'


export function parseRows(schema: any, rows: unknown[]): any[] {
  // NOTE: I might need to grab whole schema on init
  // to check if there are any typeSpace refs 
  // (idk if sql schema includes that)
  return rows.map(r => convertValue(schema, r))
}

export class SpacetimeDriverDriver implements Driver {

  readonly #config: SpacetimeDialectConfig
  constructor(config: SpacetimeDialectConfig) {
    this.#config = config
  }



  async init(): Promise<void> {
    if (!this.#config.token) {
      // Gen token if none
      let tokenUrl = new URL('identity', this.#config.server)
      const response = await fetch(tokenUrl, { method: "POST" });
      this.#config.token = response.ok ? (await response.json()).token : ''
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return {
      executeQuery: this.executeQuery.bind(this),
      streamQuery: this.streamQuery.bind(this),
    }
  }



  // Not sure transactions will be supported any time soon given reducers exist
  async beginTransaction(): Promise<void> {
    // Implement if database supports transactions over HTTP
    // await this.executeQuery(CompiledQuery.raw('BEGIN'))
  }
  async commitTransaction(): Promise<void> {
    // await this.executeQuery(CompiledQuery.raw('COMMIT'))
  }
  async rollbackTransaction(): Promise<void> {
    // await this.executeQuery(CompiledQuery.raw('ROLLBACK'))
  }


  async releaseConnection(): Promise<void> {
    // No-op for HTTP-based connections
  }
  async destroy(): Promise<void> {
    // Clean up any resources if needed
  }


  private async executeQuery<R>(compiledQuery: CompiledQuery<unknown>): Promise<QueryResult<R>> {
    // My update with official one-off query once I update stdb
    //    - https://github.com/clockworklabs/spacetimedb-typescript-sdk/blob/main/src/client_api/one_off_query.ts
    //    - https://github.com/clockworklabs/spacetimedb-typescript-sdk/blob/main/src/client_api/one_off_query_response.ts
    const sql_endpoint = new URL(`/database/sql/${this.#config.module}`, this.#config.server);
    const response = await fetch(sql_endpoint.href, {
      method: 'POST',
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa("token:"+this.#config.token)}` 
        // this is prob wrong, should prob set whole auth val rather than just token
      },
      // One downside of this is that STDB can handle multiple queries separated by ";"
      // idk if theres a way we can batch like that...
      body: compiledQuery.sql.replaceAll('"', '')
      // currently broken: table name in quotes not supported in this stdb version ig
      // replaceAll is a terrible hack for now
    })

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = await response.json()
    // console.log(JSON.stringify(result, null, 2))

    let parsed = parseRows(result[0].schema, result[0].rows)
    //console.log(parseRows(result[0].schema, result[0].rows))

    return {
      rows: parsed,
      numAffectedRows: BigInt(result.rowCount || 0),
      numChangedRows: BigInt(result.rowCount || 0),
    }
  }

  private async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    // could set up subscribe i guess? not really important tho

    // I'd almost like to stream the following:
    type StreamQuery<R> = {
      op: 'insert' | 'update' | 'delete',
      old_row: QueryResult<R> | null
      new_row: QueryResult<R> | null
      pk: string, // or other primitives maybe
    }
    // but that would be appropriating it, which is prob not great
    throw new Error('Streaming is not supported for this database')
  }
}