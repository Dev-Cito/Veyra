"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const featuresKey = ["features"] as const;

/**
 * What this deployment offers (GET /features). Until it is known, or if it
 * cannot be read, optional features count as off: a hidden button beats a
 * dead one.
 */
export function useFeatures() {
  const features = useQuery({
    queryKey: featuresKey,
    queryFn: api.features.get,
    staleTime: 10 * 60_000,
    // A failure here only hides optional buttons: no toast.
    meta: { handles: [0, 403, 404, 500, 502, 503] },
  });
  return { assistedTaskCreation: features.data?.assistedTaskCreation === true };
}
