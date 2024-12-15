import { DiscordParticipant } from "@/types/discord";
import Image from "next/image";

interface GameInviteProps {
  inviter: DiscordParticipant;
  onAccept: () => void;
  onDecline: () => void;
}

export function GameInvite({ inviter, onAccept, onDecline }: GameInviteProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-game-blue-dark rounded-xl p-6 max-w-md w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center space-x-4">
          <Image
            src={
              inviter.avatar
                ? `https://cdn.discordapp.com/avatars/${inviter.id}/${inviter.avatar}.png`
                : "https://cdn.discordapp.com/embed/avatars/0.png"
            }
            width={64}
            height={64}
            alt={"Inviter Avatar"}
            className="rounded-full"
          />
          <div>
            <h3 className="text-xl font-bold text-white">
              Game Invitation
            </h3>
            <p className="text-gray-300">
              {inviter.global_name || inviter.username} wants to play with you!
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={onAccept}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg 
              transition-colors font-semibold"
          >
            Accept
          </button>
          <button
            onClick={onDecline}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg 
              transition-colors font-semibold"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
