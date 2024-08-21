import type { PostgresDialectConfig } from 'kysely'

export interface SpacetimeDialectConfig extends Omit<PostgresDialectConfig, 'pool'> {
  server: string;
  module: string;
  token?: string;
}