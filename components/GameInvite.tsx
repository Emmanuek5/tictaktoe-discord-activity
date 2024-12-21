import { DiscordParticipant } from "@/types/discord";
import { Users } from "lucide-react";
import { soundManager } from "@/utils/sounds";

interface GameInviteProps {
  inviter: DiscordParticipant;
  onAccept: () => void;
  onDecline: () => void;
}

export function GameInvite({ inviter, onAccept, onDecline }: GameInviteProps) {
  const handleAccept = () => {
    soundManager?.playSound("click");
    onAccept();
  };

  const handleDecline = () => {
    soundManager?.playSound("click");
    onDecline();
  };

  return (
    <div className="flex flex-col items-center gap-6 min-w-[300px]">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#33ff33] bg-[#111111] flex items-center justify-center">
          {inviter.avatar ? (
            <img
              src={`https://cdn.discordapp.com/avatars/${inviter.id}/${inviter.avatar}.png`}
              alt={inviter.username}
              className="w-full h-full object-cover"
            />
          ) : (
            <Users className="w-10 h-10 text-[#33ff33]" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="font-arcade text-[#33ff33] text-xl">
            GAME INVITE
          </h3>
          <p className="font-arcade text-[#33ff33]/80">
            {inviter.global_name || inviter.username}
          </p>
        </div>
      </div>

      <div className="flex gap-4 w-full">
        <button
          onClick={handleAccept}
          className="flex-1 px-4 py-2 bg-[#111111] border-2 border-[#33ff33] text-[#33ff33] 
            hover:bg-[#33ff33] hover:text-black transition-colors font-arcade"
        >
          ACCEPT
        </button>
        <button
          onClick={handleDecline}
          className="flex-1 px-4 py-2 bg-[#111111] border-2 border-[#ff3333] text-[#ff3333]
            hover:bg-[#ff3333] hover:text-black transition-colors font-arcade"
        >
          DECLINE
        </button>
      </div>
    </div>
  );
}
