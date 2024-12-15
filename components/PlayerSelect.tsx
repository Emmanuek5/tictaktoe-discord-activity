import { ParticipantsResponse, DiscordParticipant } from "@/types/discord";
import Image from "next/image";
import { useState } from "react";

interface PlayerSelectProps {
  participants: ParticipantsResponse;
  currentUserId: string;
  onInvitePlayer: (playerId: string) => void;
}

export function PlayerSelect({ participants, currentUserId, onInvitePlayer }: PlayerSelectProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  return (
    <div className="w-full max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">
        Select Player to Challenge
      </h2>
      
      <div className="space-y-3">
        {participants.participants
          .filter(p => p.id !== currentUserId) // Don't show current user
          .map((participant) => (
            <button
              key={participant.id}
              onClick={() => {
                setSelectedPlayer(participant.id);
                onInvitePlayer(participant.id);
              }}
              disabled={selectedPlayer !== null}
              className="w-full flex items-center space-x-3 bg-game-blue-dark/50 rounded-lg p-4 
                hover:bg-game-blue-dark/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Image
                src={
                  participant.avatar
                    ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png`
                    : "https://cdn.discordapp.com/embed/avatars/0.png"
                }
                width={48}
                height={48}
                alt={"User Avatar"}
                className="rounded-full"
              />
              <div className="flex-1 text-left">
                <p className="text-lg font-semibold text-white">
                  {participant.global_name || participant.username}
                </p>
              </div>
              {selectedPlayer === participant.id && (
                <div className="text-sm text-game-blue-light animate-pulse">
                  Invitation sent...
                </div>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
