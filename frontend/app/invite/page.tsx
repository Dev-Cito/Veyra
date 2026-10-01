"use client";

import dynamic from "next/dynamic";
import { InviteSkeleton } from "./invite-view";

// Browser only: the token is read from the URL fragment (#token=…), which
// does not exist during server rendering.
const InviteView = dynamic(() => import("./invite-view"), {
  ssr: false,
  loading: () => <InviteSkeleton />,
});

export default function InvitePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone px-4 py-10">
      <InviteView />
    </main>
  );
}
