interface GameInvite {
  inviteId: string;
  inviterId: string;
  inviteeId: string;
  channelId: string;
  timestamp: number;
}

// Store pending invites in memory
const pendingInvites = new Map<string, GameInvite>();

export function createGameInvite(inviterId: string, inviteeId: string, channelId: string): GameInvite {
  const inviteId = `${inviterId}-${inviteeId}-${Date.now()}`;
  const invite: GameInvite = {
    inviteId,
    inviterId,
    inviteeId,
    channelId,
    timestamp: Date.now(),
  };
  
  pendingInvites.set(inviteId, invite);
  
  // Automatically clean up invite after 1 minute
  setTimeout(() => {
    pendingInvites.delete(inviteId);
  }, 60000);
  
  return invite;
}

export function getGameInvite(inviteId: string): GameInvite | undefined {
  return pendingInvites.get(inviteId);
}

export function removeGameInvite(inviteId: string): void {
  pendingInvites.delete(inviteId);
}

export function getPendingInvitesForUser(userId: string): GameInvite[] {
  return Array.from(pendingInvites.values()).filter(
    invite => invite.inviteeId === userId || invite.inviterId === userId
  );
}
