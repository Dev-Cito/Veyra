"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

/**
 * The open task lives in the URL (?task={id}): a shareable link, and the
 * browser's back button closes the panel. Native history calls, which the
 * Next router syncs with useSearchParams, so nothing is refetched or remounted.
 * Callers must sit under a <Suspense> (useSearchParams).
 */
export function useTaskParam() {
  const searchParams = useSearchParams();
  const taskId = searchParams.get("task");
  // true when this page pushed the entry: closing then goes back, so the
  // back button does not reopen the panel afterwards.
  const pushed = useRef(false);

  const withTask = useCallback((id: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (id) {
      params.set("task", id);
    } else {
      params.delete("task");
    }
    const query = params.toString();
    return `${window.location.pathname}${query ? `?${query}` : ""}`;
  }, []);

  const open = useCallback(
    (id: string) => {
      if (new URLSearchParams(window.location.search).has("task")) {
        // Switching task: one entry for the panel, not one per card opened.
        window.history.replaceState(null, "", withTask(id));
      } else {
        window.history.pushState(null, "", withTask(id));
        pushed.current = true;
      }
    },
    [withTask],
  );

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      // Arrived through a shared link: no entry of ours to go back to.
      window.history.replaceState(null, "", withTask(null));
    }
  }, [withTask]);

  return { taskId, open, close };
}
