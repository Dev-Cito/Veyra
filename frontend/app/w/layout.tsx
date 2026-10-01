"use client";

import { AuthGate } from "@/components/app/auth-gate";
import { Rail } from "@/components/app/rail";

/** The signed-in app: workspace rail + the current page. */
export default function AppLayout({ children }: LayoutProps<"/w">) {
  return (
    <AuthGate>
      {(user) => (
        <div className="flex h-dvh flex-col overflow-hidden bg-stone md:flex-row">
          <Rail user={user} />
          <div className="flex min-h-0 min-w-0 flex-1">{children}</div>
        </div>
      )}
    </AuthGate>
  );
}
