import { ParticipantsResponse, DiscordParticipant } from "@/types/discord";
import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import { Button } from "./ui/button";

interface PlayerSelectProps {
  participants: ParticipantsResponse;
  currentUserId: string;
  onInvitePlayer: (playerId: string) => void;
}

export function PlayerSelect({
  participants,
  currentUserId,
  onInvitePlayer,
}: PlayerSelectProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const availablePlayers = participants.participants.filter(
    (p) => p.id !== currentUserId && !p.bot
  ); // Don't show current user or bots

  if (availablePlayers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="font-arcade text-[#33ff33] mb-2">SELECT OPPONENT</div>
        <div className="flex flex-col items-center gap-4 p-6 border-2 border-[#33ff33] rounded-none">
          <Loader2 className="w-8 h-8 text-[#33ff33] animate-spin" />
          <div className="font-arcade text-[#33ff33] text-center">
            WAITING FOR PLAYERS...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 max-w-md w-full">
      <div className="font-arcade text-[#33ff33] mb-2">SELECT OPPONENT</div>

      <div className="w-full space-y-3">
        {availablePlayers.map((participant) => (
          <button
            key={participant.id}
            onClick={() => {
              console.log("Inviting player:", participant);
              setSelectedPlayer(participant.id);
              onInvitePlayer(participant.id);
            }}
            disabled={selectedPlayer !== null}
            className="w-full flex items-center gap-3 p-4 bg-[#111111] border-2 border-[#33ff33] 
              hover:bg-[#222222] transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              disabled:hover:bg-[#111111]"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#33ff33] bg-[#111111] flex items-center justify-center">
              {participant.avatar ? (
                <img
                  src={`https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png`}
                  alt={participant.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Users className="w-6 h-6 text-[#33ff33]" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="font-arcade text-[#33ff33]">
                {participant.global_name || participant.username}
              </p>
              {participant.global_name && (
                <p className="font-arcade text-sm text-[#33ff33]/70">
                  @{participant.username}
                </p>
              )}
            </div>
            {selectedPlayer === participant.id && (
              <div className="flex items-center gap-2 font-arcade text-sm text-[#33ff33]">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>INVITING...</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
