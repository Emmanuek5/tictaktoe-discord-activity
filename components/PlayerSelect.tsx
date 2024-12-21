import { ParticipantsResponse, DiscordParticipant } from "@/types/discord";
import Image from "next/image";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface PlayerSelectProps {
  participants: ParticipantsResponse;
  currentUserId: string;
  onInvitePlayer: (playerId: string) => void;
}

export function PlayerSelect({ participants, currentUserId, onInvitePlayer }: PlayerSelectProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  const availablePlayers = participants.participants
    .filter(p => p.id !== currentUserId && !p.bot); // Don't show current user or bots

  if (availablePlayers.length === 0) {
    return (
      <div className="w-full max-w-md mx-auto text-center">
        <h2 className="text-2xl font-bold text-white mb-6">
          Select Player to Challenge
        </h2>
        <div className="flex flex-col items-center justify-center space-y-4 p-8 bg-game-blue-dark/50 rounded-lg">
          <Loader2 className="w-8 h-8 text-game-blue-light animate-spin" />
          <p className="text-white/70">Waiting for other players to join...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">
        Select Player to Challenge
      </h2>
      
      <div className="space-y-3">
        {availablePlayers.map((participant) => (
          <button
            key={participant.id}
            onClick={() => {
              console.log("Inviting player:", participant);
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
              <p className="text-sm text-white/70">
                {participant.global_name ? `@${participant.username}` : ""}
              </p>
            </div>
            {selectedPlayer === participant.id && (
              <div className="flex items-center space-x-2 text-sm text-game-blue-light">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Inviting...</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
