import { InitAuthAndWorkspaces1790349278567 } from './1790349278567-InitAuthAndWorkspaces.js';
import { AddBoardsListsTasks1790351614988 } from './1790351614988-AddBoardsListsTasks.js';
import { AddInvitations1790586767721 } from './1790586767721-AddInvitations.js';
import { AddUserTimezone1790856700345 } from './1790856700345-AddUserTimezone.js';

// Register every migration here, in chronological order.
export const migrations: Function[] = [
  InitAuthAndWorkspaces1790349278567,
  AddBoardsListsTasks1790351614988,
  AddInvitations1790586767721,
  AddUserTimezone1790856700345,
];
