/*
  JSX helper to directly itterate over Maps

  Inspired <Entries/> of @solid-primitives/keyed:
  https://github.com/solidjs-community/solid-primitives/blob/6cd7857b5bccb16e68e62d97592980c8bb667f9f/packages/keyed/src/index.ts#L179
*/
import { createMemo, mapArray } from "solid-js";
import type { Accessor, JSX } from "solid-js";

export function MapIter<K, V>(props: {
  of: Map<K, V>;
  fallback?: JSX.Element;
  children: (key: K, v: Accessor<V>, i: Accessor<number>) => JSX.Element;
}): JSX.Element {
  const mapFn = props.children;
  return createMemo(
    mapArray(
      () => props.of && Array.from(props.of.keys()),
      (key: K, i) => mapFn(key, () => props.of.get(key)!, i),
      "fallback" in props ? { fallback: () => props.fallback } : undefined,
    ),
  ) as unknown as JSX.Element;
}
