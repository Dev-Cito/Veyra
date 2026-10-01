import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/format";
import type { Role } from "@/lib/types";

export type RoleMarkRole = Role | "PENDING";

const FILLED: Record<RoleMarkRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
  PENDING: 0,
};

const HEIGHTS = [6, 9, 12];

/**
 * Three rising bars: the NUMBER of filled bars encodes authority (owner 3,
 * admin 2, member 1, pending invitation 0), so colour never carries the
 * information alone.
 */
export function RoleMark({
  role,
  showLabel = true,
  className,
}: {
  role: RoleMarkRole;
  showLabel?: boolean;
  className?: string;
}) {
  const label = ROLE_LABELS[role];
  const filled = FILLED[role];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      {...(showLabel ? {} : { role: "img", "aria-label": `Rôle : ${label}` })}
    >
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {HEIGHTS.map((height, index) => (
          <span
            key={height}
            className={cn("w-[3px] rounded-[1px]", index < filled ? "bg-plum" : "bg-rail")}
            style={{ height }}
          />
        ))}
      </span>
      {showLabel && <span className="text-[12px] text-ink-2">{label}</span>}
    </span>
  );
}
