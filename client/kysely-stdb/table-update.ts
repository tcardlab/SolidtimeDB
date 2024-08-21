/*
  There may be an argument for applying all ops to the table before 
  emitting events. That being, a callback that tries to access the 
  table vals itself would be precarious as the data is volatile.
  The order of operations may not be performed in how the dev intuits
  it should be. However, its easy to imagine the end of a transaction update.

  its a bit presumptuous to just build the db.
  i like what stdb did where i have the ability to overwrite that with custom logic
*/
import type EventEmitter from './event'
import { convertValue } from './parse'

function get_pk(table_name:string) {
  // this will have to be hardcoded as there is no way to
  // get this info without the bindings...
  return {
    'User': 'identity'
  }?.[table_name]
}



/***    EXPERIMENTAL TABLE UPDATE    ***\
  presort operations for simpler update deduction.
  if delete precedes insert of same pk, its an update.

  if no pk defined, there are no updates.
*/
export const experimental_table_update = (schema: SchemaExpanded, database: DB, EE: EventEmitter) => (
  table_arr: TableUpdate[]
) => {
  for (let table_op of table_arr) {

    // Get or generate table
    let table = database.get(table_op.table_name)
    if (!table) {
      database.set(table_op.table_name, new Map())
      table = database.get(table_op.table_name)!
    }

    // Table Vars 
    let table_entity = schema.entities[table_op.table_name] // table schema
    let pk_column = get_pk(table_op.table_name)
    let operations = table_op.table_row_operations

    // No updates if no PK.
    if (!pk_column) {
      for (let row_op of operations) {
        let key = JSON.stringify(row_op.row) // wonder if Buffer.from(row_op.row) is faster
        // might compress or hash to reduce mem footprint, tbd depends on perf
        // https://github.com/Senryoku/smol-string  
        // note some things operate faster on buffer than string
        // https://github.com/Daninet/hash-wasm or crypto, idk
        switch (row_op.op) {
          case 'insert': 
            let val = convertValue(table_entity.schema, row_op.row, schema.typespace as any)
            table.set(key, val)
            EE.emit('insert', {table: table_op.table_name, old_val:null, val})
            continue
          case 'delete':
            let old_val = table.get(key)
            table.delete(key)
            EE.emit('delete', {table: table_op.table_name, old_val, val: null})
            continue
        }
      }
    } 

    // Group updates if PK. (might wanna send pk through the event {pk: {col_name: val}, ...})
    else {
      // Using index so we can avoid some parsing
      let pk_index = table_entity.schema.elements.findIndex(col => col.name.some === pk_column)
      /* NOTE: This currently assumes you are subscribing to the whole row!
         otherwise pk may not have been in the selection or the index may not line up.
         we'd have to make a bad sql query to get the schema back without results,
         theres no api to get just the schema of a query.
         things could get more complicated with col renaming...
      */

      // I am under the assumption that the row_op are in order (deletes b4 inserts for updates)
      // if thats wrong they may need to be presorted/mapped

      interface RowOp {op: null|'insert'|'delete', row: null|any[]}
      let last_row: RowOp = { op: null, row: null }
      let last_pk: any | null = null;
      let old_val: any = null

      // Because we use a look back to delete, 
      // a dummy value is passed to catch the last op
      for (const row_op of [...operations, {op: null, row: null}]) {
        // Ensure key is primitive, else stringify
        let key = row_op.row?.[pk_index] // undefined on last run
        if (typeof key === 'object') key = JSON.stringify(key)
        
        // Can't delete until we know next val isn't an update
        if (last_row.op === 'delete') {
          old_val = table.get(last_pk) // prob faster than re-parsing last_row.row

          if (key !== last_pk) {
            // delete - diff pk means not its an update
            EE.emit('delete', {table: table_op.table_name, old_val, val: null})
            old_val = null
          }

          // delete last loops value given we have determined updates.
          table.delete(last_pk) // prob move into if above as update can overwrite 
        }

        if (row_op.op === 'insert') {
          let val = convertValue(table_entity.schema, row_op.row, schema.typespace as any)
          table.set(key, val)

          if (key !== last_pk) {
            // insert
            EE.emit('insert', {table: table_op.table_name, old_val: null, val})
          } else {
            // update
            EE.emit('update', {table: table_op.table_name, old_val, val})
            old_val = null
          }
        }

        last_pk = key
        last_row = row_op
      }
    }
  }
}




/***    SIMPLE TABLE UPDATE    ***\
  doesn't bother with update handling or pk, just raw inserts and deletes.
  because we don't have to group update row_ops, we can greatly simplify 
  things by handling row_ops independently.
*/
function handle_row_op(table: Table<any>, table_entity: Entity, row_op:RowOp, schema: SchemaExpanded, EE:EventEmitter) {
  switch (row_op.op) {
    case "insert": {
      let row_parsed = convertValue(table_entity.schema, row_op.row, schema.typespace as any)
      table.set(JSON.stringify(row_op.row), row_parsed)
    }
    case "delete": {
      table.delete(JSON.stringify(row_op.row))
    }
  }
}

export const simple_table_update = (schema: SchemaExpanded, database: DB, EE: EventEmitter) => (
  table_arr: TableUpdate[]
) => {
  for (let table_op of table_arr) {

    let table = database.get(table_op.table_name)
    if (!table) {
      table = database.set(table_op.table_name, new Map())
    }

    let table_entity = schema.entities[table_op.table_name]

    for(let row_op of table_op.table_row_operations) {
      handle_row_op(table, table_entity, row_op, schema, EE)
    }
  }
}




/***    PRODUCTION TABLE UPDATE    ***\
  Performs a preprocessing step to isolate inserts as well as 
  Find updates by associating deletes and insets through pk value.
  Then, it iterates over the operations types individually.
  This is a robust implementation.
  Notably, it also uses the full row as the key, even when for pk tables.
*/
export const production_table_update = (schema: SchemaExpanded, database: DB, EE: EventEmitter) => (
  table_arr: TableUpdate[]
) => {
  for (let table_op of table_arr) {

    // Get or generate table
    let table = database.get(table_op.table_name)
    if (!table) {
      database.set(table_op.table_name, new Map())
      table = database.get(table_op.table_name)!
    }

    // Table Vars 
    let table_entity = schema.entities[table_op.table_name] // table schema
    let pk_column = get_pk(table_op.table_name)
    let operations = table_op.table_row_operations
  
    // No updates if no PK.
    if (!pk_column) {
      for (const row_op of operations) {
        let key = JSON.stringify(row_op.row)
        if (row_op.op === "insert") {
          let val = convertValue(table_entity.schema, row_op.row, schema.typespace as any)
          table.set(key, val)
          EE.emit('insert', { table: table_op.table_name, old_val: null, val })
        } else {
          let old_val = table.get(key)
          table.delete(key)
          EE.emit('delete', {table: table_op.table_name, old_val, val: null})
        }
      }
    }

    // Updates if PK.
    else {
      let pk_index = table_entity.schema.elements.findIndex(col => col.name.some === pk_column)
      let get_pk_val = (row_op:RowOp)=>JSON.stringify(row_op.row[pk_index])

      const inserts: any[] = [];
      const deleteMap = new Map<any, RowOp>();
      for (const row_op of operations) {
        if (row_op.op === "insert") {
          inserts.push(row_op);
        } else {
          // idk if pk can be a complex value, so i stringify it
          deleteMap.set(get_pk_val(row_op), row_op);
        }
      }
      for (const row_op of inserts) {
        const key = JSON.stringify(row_op.row)
        const old_val = deleteMap.get(get_pk_val(row_op)); // get delete op from map by pk

        let val = convertValue(table_entity.schema, row_op.row, schema.typespace as any)
        table.set(key, val)

        if (old_val) {
          // the pk for updates will differ between insert/delete, so we have to
          // use the instance from delete
          let delete_key = JSON.stringify(old_val.row)
          table.delete(delete_key)
          EE.emit('update', {table: table_op.table_name, old_val, val})
          deleteMap.delete(get_pk_val(row_op));
        } else {
          EE.emit('insert', {table: table_op.table_name, old_val:null, val})
        }
      }
      for (const row_op of deleteMap.values()) {
        const key = JSON.stringify(row_op.row)
        table.delete(key)

        let old_val = table.get(JSON.stringify(row_op.row))
        EE.emit('delete', {table: table_op.table_name, old_val, val: null})
      }
    } 
  
  }
}
// no guarantees this is correct... haven't tested yet.




/***    CONCISE TABLE UPDATE    ***\
  Just for fun...
*/
export const concise_table_update = (schema: SchemaExpanded, database: DB, EE: EventEmitter) => (
  table_arr: TableUpdate[]
) => {
  for (let table_op of table_arr) {

    // Get or generate table
    let table = database.get(table_op.table_name)
    if (!table) {
      database.set(table_op.table_name, new Map())
      table = database.get(table_op.table_name)!
    }

    // Table Vars 
    let table_entity = schema.entities[table_op.table_name] // table schema
    let pk_column = get_pk(table_op.table_name)
    let operations = table_op.table_row_operations
  
    // No updates if no PK.
    if (!pk_column) {
      for (const row_op of operations) {
        let key = JSON.stringify(row_op.row)
        if (row_op.op === "insert") {
          let val = convertValue(table_entity.schema, row_op.row, schema.typespace as any)
          table.set(key, val)
          EE.emit('insert', { table: table_op.table_name, old_val: null, val })
        } else {
          let old_val = table.get(key)
          table.delete(key)
          EE.emit('delete', {table: table_op.table_name, old_val, val: null})
        }
      }
    }

    // Updates if PK.
    else {
      let pk_index = table_entity.schema.elements.findIndex(col => col.name.some === pk_column)
      let get_pk_val = (row_op:RowOp)=>JSON.stringify(row_op.row[pk_index])

      // group by pk
      let op_groups = operations.reduce((acc, row_op) => {
        let key = get_pk_val(row_op)
        const group = acc[key] || (acc[key] = []);
        group.push(row_op);
        return acc
      }, {} as Record<string, RowOp[]>);
      
      // group by op
      type Row=any[]
      type EventOp = {key: string, old_val:Row|null, new_val:Row|null}
      let result = Object.entries(op_groups).reduce((acc, [key, group]) => {
        if (group.length >= 2) {
          acc['update'].push({
            key,
            old_val: group.find(x=>x.op==='delete')?.row!,
            new_val: group.findLast(x=>x.op==='insert')?.row!
          })
        } else {
          let is_insert = group[0].op === 'insert'
          acc[group[0].op].push(
            is_insert
            ? { key, old_val: null, new_val: group[0].row }
            : { key, old_val: group[0].row, new_val: null }
          )
        }
        return acc;
      }, {insert: [], update: [], delete: []} as Record<'insert'|'update'|'delete', EventOp[]>);


      // These could technically be handled in-place in the prior function (as foreach)
      result.insert.forEach(({key, old_val, new_val})=>{
        let val = convertValue(table_entity.schema, new_val, schema.typespace as any)
        table.set(key, val)
        EE.emit('insert', { table: table_op.table_name, old_val, val })
      })

      result.update.forEach(({key, old_val, new_val})=>{
        let old_val_parsed = table.get(key)
        let val = convertValue(table_entity.schema, new_val, schema.typespace as any)
        table.set(key, val) // just overwrite old key
        EE.emit('update', {table: table_op.table_name, old_val: old_val_parsed, val})
      })

      result.delete.forEach(({key, old_val, new_val})=>{
        let old_val_parsed = table.get(key)
        table.delete(key)
        EE.emit('delete', {table: table_op.table_name, old_val: old_val_parsed, val: null})
      })
    }
  }
}




/***    CONCISE TABLE UPDATE 2    ***\
  Just for fun...
*/
export const concise_table_update2 = (schema: SchemaExpanded, database: DB, EE: EventEmitter) => (
  table_arr: TableUpdate[]
) => {
  for (let table_op of table_arr) {

    // Get or generate table
    let table = database.get(table_op.table_name)
    if (!table) {
      database.set(table_op.table_name, new Map())
      table = database.get(table_op.table_name)!
    }

    // Table Vars 
    let table_entity = schema.entities[table_op.table_name] // table schema
    let pk_column = get_pk(table_op.table_name)
    let operations = table_op.table_row_operations
  
    // No updates if no PK.
    if (!pk_column) {
      for (const row_op of operations) {
        let key = JSON.stringify(row_op.row)
        if (row_op.op === "insert") {
          let val = convertValue(table_entity.schema, row_op.row, schema.typespace as any)
          table.set(key, val)
          EE.emit('insert', { table: table_op.table_name, old_val: null, val })
        } else {
          let old_val = table.get(key)
          table.delete(key)
          EE.emit('delete', {table: table_op.table_name, old_val, val: null})
        }
      }
    }

    // Updates if PK.
    else {
      let pk_index = table_entity.schema.elements.findIndex(col => col.name.some === pk_column)
      let get_pk_val = (row_op:RowOp)=>JSON.stringify(row_op.row[pk_index])

      // group by pk
      let op_groups = operations.reduce((acc, row_op) => {
        let key = get_pk_val(row_op)
        const group = acc.get(key) || acc.set(key, []).get(key)!;
        group.push(row_op);
        return acc
      }, new Map<string, RowOp[]>());
      
      // group by op
      for (const [key, group] of op_groups) {
        if (group.length >= 2) {
          let old_val = table.get(key)
          let last_insert = group.findLast(x=>x.op==='insert')?.row!
          let val = convertValue(table_entity.schema, last_insert, schema.typespace as any)
          table.set(key, val) // just overwrite old key
          EE.emit('update', {table: table_op.table_name, old_val, val})
        } else {
          let is_insert = group[0].op === 'insert'
          let [val, old_val]:(Record<string, any>|null)[] = [null, null];
          if (is_insert) {
            val = convertValue(table_entity.schema, group[0].row, schema.typespace as any)
            table.set(key, val)
          } else {
            old_val = table.get(key)
            table.delete(key)
          }
          EE.emit(group[0].op, { table: table_op.table_name, old_val, val })
        }
      }
    }
  }
}
