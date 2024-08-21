// dialect.ts
import { PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, Dialect, DialectAdapter, Driver, Kysely, QueryCompiler, DatabaseIntrospector } from 'kysely'
import type { SpacetimeDialectConfig } from './config'
import { SpacetimeDriverDriver } from './driver'

export class SpacetimeDialect implements Dialect {
  readonly #config: SpacetimeDialectConfig

  constructor(config: SpacetimeDialectConfig) {
    this.#config = config
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter()
  }

  createDriver(): Driver {
    return new SpacetimeDriverDriver(this.#config)
  }

  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new PostgresIntrospector(db)
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler()
  }
}