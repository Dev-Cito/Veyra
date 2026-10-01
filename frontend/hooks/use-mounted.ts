"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * false during server rendering and hydration, true once React runs in the
 * browser. Without a state update in an effect: the server snapshot is false,
 * the client snapshot true.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
