import { WorkspaceShell } from "@/components/app/workspace-shell";

/** Structure only: the data is fetched in the browser, by WorkspaceShell. */
export default async function WorkspaceLayout({
  children,
  params,
}: LayoutProps<"/w/[workspaceId]">) {
  const { workspaceId } = await params;
  return <WorkspaceShell workspaceId={workspaceId}>{children}</WorkspaceShell>;
}
