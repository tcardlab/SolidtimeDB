/*
  LIVE-FILTER

  Reactive primitive to aid in filtering live data.

  Returns
  • filtered reactive store of your choice, as defined in filter_storage 
    (read-only)

  Params
  • source_store: This is a getter to retrieve the source data.
    Note: source_store cannot be reactive as updating it triggers
    a full refilter. resolved by untracking it:
      source_store = () => untrack(() => convert to non-reactive obj here)

  • filter: A reactive filter, supports total replacement and 
    updating deeper signals to trigger full refiltering.

  • events: This is how 3rd party events are tied into the system.
    inputs from their api are to be mapped to suite our key-value event system.
    These are filtered on a per value basis and avoid fully refiltering.
    (Note: it is not necessary to use all events.)

  • filter_storage: reactive data-type to store filtered data 
    and function bindings to be agnostic to preferred type. 
    (Note: This could prob default to ReactiveMap or createStore)
*/

import { createComputed, onCleanup, createSignal, batch, getOwner, runWithOwner } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import type { Accessor } from "solid-js";
import { ReactiveMap } from "@solid-primitives/map";
import { ReactiveSet } from "@solid-primitives/set";

/***   EventMap Typings   ***/
type InsertHandler <T> = (key: string, item: T) => void;
type ClearInsertHandler <T>= (cb: InsertHandler<T>) => void;
type UpdateHandler <T> = (old_key: string, key: string, item: T) => void;
type ClearUpdateHandler <T>= (cb: UpdateHandler<T>) => void;
type DeleteHandler = (key: string) => void;
type ClearDeleteHandler = (cb: DeleteHandler) => void;
type RefetchHandler = () => void;
type ClearRefetchHandler = (cb: RefetchHandler) => void;

// similar to "from" primitive: https://docs.solidjs.com/reference/reactive-utilities/from
export type EventMap <T> = () => {
  register_insert?: (cb: InsertHandler<T>) => void | ClearInsertHandler<T>;
  register_update?: (cb: UpdateHandler<T>) => void | ClearUpdateHandler<T>;
  register_delete?: (cb: DeleteHandler) => void | ClearDeleteHandler;
  register_refetch?: (cb: RefetchHandler) => void | ClearRefetchHandler;
  register_cleanup?: () => void;
};

/***   Main   ***/
export function live_filter<T, Key=string>(
  source_store: () => Map<string, T> | [string, T][], // () => Object.entries({})?
  filter: Accessor<undefined | ((item: T) => boolean)>,
  events: EventMap<T>,
  filter_storage: () => {
    filter_store: () => Map<string, T> | [string, T][];
    filter_set: (key: string, v: T) => void;
    filter_update: (old_key: string, key: string, v: T) => void;
    filter_delete: (key: string) => void;
    filter_clear: () => void;
  } = map_store,
) {
  const {
    register_insert,
    register_update,
    register_delete,
    register_refetch,
    register_cleanup
  } = events();
  const {
    filter_clear,
    filter_set,
    filter_store,
    filter_update,
    filter_delete,
  } = filter_storage();
  let init = false; // switch to start tracking first item on demand

  // We want precise control over when source is marked dirty.
  // So we track a wrapper that will trigger full refilter in the computed
  // and we trigger via the register_refetch callback.
  let [track, dirty] = createSignal(undefined, { equals: false });
  let wrapped_source = () => {
    track();
    return source_store();
  };

  let owner  = getOwner()
  let RegisterEffect = (first_input: T) => {
    let first_filter: boolean;
    runWithOwner(owner,
      // RegisterEffect is likely run in an event handler, 
      // thus we need to manually  pass it the proper owner
      ()=>createComputed(() => {
        if (!init) {
          // Init tracking on filter and wrapped_source
          // Note: 
          //   normally on() can be used for explicit deps
          //   but filter()(item) requires an input which make that difficult
          //   thus we start tracking on first insert
          track();
          first_filter = filter()!(first_input);
          init = true;
        } else {
          // If either of the above tracker are triggered, we do a full refilter
          // (ie filter swap, filter dep update, or refetch)
          filter_clear();
          if (filter() === undefined) return

          console.log("refilter");
          for (let [key, item] of wrapped_source()) {
            if (filter()!(item)) filter_set(key, item);
          }
        }
      })
    )
    return first_filter!; // acts as a filter for convenience
  };

  let insertCB = (key: string, item: T) => {
    if (filter() === undefined) return
    // Filter of register effect on first item (register effect also filters)
    let is_filtered = init ? filter()!(item) : RegisterEffect(item);
    if (is_filtered) {
      filter_set(key, item);
    }
  };
  let cleanInsert = register_insert?.(insertCB);

  // Handle any initial data:
  // iterate over it pretending they are inserts.
  if (
    (wrapped_source() as Map<string, T>)?.size ||
    (wrapped_source() as [string, T][])?.length
  ) {
    for (let [key, item] of wrapped_source()) {
      //console.log(key);
      insertCB(key, item);
    }
    // console.log("finished filtering initial data.");
  }

  // Will trigger full refilter on new data.
  let refetchCB = () => dirty();
  let cleanRefetch = register_refetch?.(refetchCB);

  let updateCB = (old_key: string, key: string, item: T) => {
    if (filter() === undefined) return
    if (filter()!(item)) {
      // still valid, but update key
      filter_update(old_key, key, item);
      return;
    } else {
      // no longer valid, remove
      filter_delete(old_key);
    }
  };
  let cleanUpdate = register_update?.(updateCB);

  let deleteCB = (old_key: string) => {
    if (filter() === undefined) return
    // deleted, remove
    filter_delete(old_key);
  };
  let cleanDelete = register_delete?.(deleteCB);

  // Clean any event listeners if applicable
  onCleanup(() => {
    cleanInsert?.(insertCB);
    cleanUpdate?.(updateCB);
    cleanDelete?.(deleteCB);
    cleanRefetch?.(refetchCB);
    register_cleanup && register_cleanup()
  });

  return filter_store; // filtered reactive store of your choice (read-only)
}

/***   filter_storage Helpers   ***/
export let map_store = <T>() => {
  let store = new ReactiveMap<string, T>();
  return {
    filter_store: () => store,
    filter_set: (key: string, v: T) => store.set(key, v),
    filter_update: (old_key: string, key: string, v: T) => {
      batch(() => {
        // Delete before set in case the same key is used.
        store.delete(old_key);
        store.set(key, v);
      });
    },
    // no need to check for existence of key first, other data types might tho.
    filter_delete: (key: string) => store.delete(key),
    filter_clear: () => store.clear(),
  };
};

// Haven't tested this yet, might be small bugs
export let object_store = () => {
  let [store, setStore] = createStore<Record<string, any>>({});
  return {
    filter_store: () => store,
    filter_set: (key: string, value: any) => setStore(key, value),
    filter_update: (old_key: string, key: string, v: any) => {
      batch(() => {
        // Delete before set in case the same key is used
        setStore(old_key, undefined);
        setStore(key, v);
      });
    },
    filter_delete: (old_key: string) => setStore(old_key, undefined),
    filter_clear: () => setStore(reconcile({})),
  };
};

// might not work cuz the filter assumes string based key...
export let set_store = <T>() => {
  let store = new ReactiveSet<T>();
  return {
    filter_store: () => store,
    filter_set: (key: T, v: undefined) => store.add(key),
    filter_update: (old_key: T, key: T, mutable: boolean) => {
      // tricky... 
      // if they update mutates the object<T>, there's no need to do anything.
      // if not, the we must still delete and replace.
      if (mutable) return
      batch(() => {
        // Delete before set in case the same key is used.
        store.delete(old_key);
        store.add(key);
      });
    },
    filter_delete: (key: T) => store.delete(key),
    filter_clear: () => store.clear(),
  };
};