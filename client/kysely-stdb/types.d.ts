interface RowOp {
  op: "insert" | "delete"
  row: any[]
}

interface TableUpdate {
  table_id: number,
  table_name: string,
  table_row_operations: RowOp[]
}

type RowPK = String
type Table<T>= Map<RowPK, T>
type DB = Map<String, Table<any>>


interface Entity {
  type: "table" | "reducer"
  arity: number //int
  schema: {elements: any[]}
}

interface SchemaExpanded {
  entities: Record<string, Entity>,
  typespace: Record<string, any>[]
}

type StreamQueryRes<Row> = {
  op: 'insert' | 'update' | 'delete',
  old_row: Row | null
  new_row: Row | null
  pk: string, // or other primitives maybe
}