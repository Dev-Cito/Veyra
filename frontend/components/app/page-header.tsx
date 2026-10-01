"use client";

import { PanelLeft } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Lets a page header open the workspace drawer on small screens. */
export const WorkspaceNavContext = createContext<{ openNav: () => void } | null>(null);

/**
 * The title bar of the main zone: 13px vertical padding on surface, hairline
 * bottom border. Actions go on the right.
 */
export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  const nav = useContext(WorkspaceNavContext);
  return (
    <header className="flex min-h-[58px] items-center gap-2 border-b border-hair bg-surface px-4 py-[13px] md:px-6">
      {nav && (
        <Button
          variant="ghost"
          size="icon"
          className="-ml-1.5 md:hidden"
          onClick={nav.openNav}
          aria-label="Ouvrir le menu de l'espace"
        >
          <PanelLeft aria-hidden="true" />
        </Button>
      )}
      <h1 className="font-display min-w-0 flex-1 truncate text-[17px] font-bold text-ink">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto bg-stone px-4 py-5 md:px-6 md:py-6">{children}</div>;
}
