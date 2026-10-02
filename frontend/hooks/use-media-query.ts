"use client";

import { useCallback, useSyncExternalStore } from "react";

/** false on the server and before hydration: the desktop layout renders first. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below 768px: columns become tabs, the detail panel goes full screen. */
export const useIsMobile = () => useMediaQuery("(max-width: 767.98px)");
