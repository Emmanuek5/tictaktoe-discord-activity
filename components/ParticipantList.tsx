import { GameState } from "@/server/types";
import { ParticipantsResponse, DiscordParticipant } from "@/types/discord";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ParticipantListProps {
  participants: ParticipantsResponse;
  gameState: GameState | null;
  currentUserId: string;
}

export function ParticipantList({
  participants,
  gameState,
  currentUserId,
}: ParticipantListProps) {
  console.log("PARTICIPANTS", JSON.stringify(participants, null, 2));

  const getParticipantStatus = (participant: DiscordParticipant) => {
    if (!gameState) return null;

    if (participant.id === "AI") {
      return gameState.players.O === "AI" ? "O" : null;
    }

    if (gameState.players.X === participant.id) return "X";
    if (gameState.players.O === participant.id) return "O";
    return null;
  };

  const getParticipantAvatar = (participant: DiscordParticipant) => {
    if (participant.id === "AI") {
      return "https://cdn.discordapp.com/embed/avatars/0.png"; // Default Discord bot avatar
    }
    if (!participant.avatar) {
      const defaultIndex = parseInt(participant.discriminator) % 5;
      return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    }
    return `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png`;
  };

  return (
    <div className="bg-game-blue-dark/50 rounded-xl p-4">
      <h2 className="text-lg font-bold text-white mb-4">Participants</h2>
      <div className="space-y-2">
        {participants.participants.map((participant) => {
          const status = getParticipantStatus(participant);
          return (
            <div
              key={participant.id}
              className={cn(
                "flex items-center gap-3 p-2 rounded-lg transition-colors",
                participant.id === currentUserId && "bg-game-blue-dark/50",
                status === "X" && "text-game-purple",
                status === "O" && "text-game-blue-light"
              )}
            >
              <div className="relative w-8 h-8">
                <Image
                  src={getParticipantAvatar(participant)}
                  alt={participant.username}
                  className="rounded-full"
                  width={32}
                  height={32}
                />
                {status && (
                  <div
                    className={cn(
                      "absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold",
                      status === "X"
                        ? "bg-game-purple text-white"
                        : "bg-game-blue-light text-white"
                    )}
                  >
                    {status}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {participant.global_name || participant.username}
                  {participant.id === "AI" && " 🤖"}
                </div>
                {participant.id === currentUserId && (
                  <div className="text-xs text-white/60">You</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
