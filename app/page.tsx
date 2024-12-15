"use client";

import { useDiscordContext } from "@/contexts/DiscordContext";
import { useEffect, useState } from "react";
import { ParticipantsResponse } from "@/types/discord";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { GameInvite } from "@/components/GameInvite";

export default function Home() {
  const router = useRouter();
  const {
    isLoading,
    error,
    auth,
    currentGuild,
    currentChannel,
    sdk,
    currentUser,
  } = useDiscordContext();

  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [participants, setParticipants] = useState<ParticipantsResponse | null>(
    null
  );
  const [socket, setSocket] = useState<any>(null);
  const [gameInvite, setGameInvite] = useState<{
    inviter: any;
    inviteId: string;
  } | null>(null);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const width = Math.min(Math.max(window.innerWidth, 1536), 1536);
      const height = Math.min(Math.max(window.innerHeight, 720), 720);
      setPageSize({ width, height });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle Discord participants
  useEffect(() => {
    const getParticipants = async () => {
      if (!sdk?.channelId || !auth) return;

      const participants =
        await sdk.commands.getInstanceConnectedParticipants();
      sdk?.subscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantUpdate
      );
      setParticipants(participants);
    };

    const handleParticipantUpdate = (e: ParticipantsResponse) => {
      console.log("PARTICIPANTS_UPDATE", e);
      setParticipants(e);
    };

    getParticipants();

    return () => {
      sdk?.unsubscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantUpdate
      );
    };
  }, [sdk, auth]);

  // Handle socket connection
  useEffect(() => {
    if (!currentUser || !sdk?.channelId) return;

    const newSocket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000"
    );
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected to socket server");
      newSocket.emit("initializeSession", {
        channelId: sdk.channelId,
        userId: currentUser.id,
        username: currentUser.username,
        isAIGame: false,
      });
    });

    newSocket.on("gameInvite", ({ inviter, inviteId }) => {
      setGameInvite({ inviter, inviteId });
    });

    return () => {
      newSocket.close();
      setSocket(null);
      setGameInvite(null);
    };
  }, [currentUser, sdk?.channelId]);

  const handleInviteResponse = (accepted: boolean) => {
    if (!socket || !gameInvite || !currentUser || !sdk?.channelId) return;

    socket.emit("respondToInvite", {
      inviteId: gameInvite.inviteId,
      accepted,
      inviterId: gameInvite.inviter.id,
      inviteeId: currentUser.id,
      channelId: sdk.channelId,
    });

    if (accepted) {
      router.push("/game?mode=multiplayer");
    }

    setGameInvite(null);
  };

  if (isLoading || !pageSize.width || !pageSize.height) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-gradient-to-br from-game-blue-dark to-zinc-900">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white animate-pulse">
            Loading
          </h1>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-game-purple border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <main className="text-white overflow-hidden flex flex-col h-screen w-screen">
      <div className="flex flex-col h-full p-4">
        <h1 className="text-3xl font-extrabold text-center mb-4 text-white">
          Tictactoe Showdown
        </h1>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Left Box - User Data */}
          <div className="w-1/5 min-w-[200px] bg-game-blue-dark/50 rounded-xl p-4 shadow-lg backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white mb-4 border-b border-game-blue-light/30 pb-2">
              Player Profile
            </h2>
            <div className="space-y-4 text-gray-200">
              <div className="flex flex-col items-center">
                <Image
                  src={
                    currentUser?.avatar
                      ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
                      : "https://cdn.discordapp.com/embed/avatars/0.png"
                  }
                  width={160}
                  height={160}
                  alt={"User Avatar"}
                  className="w-40 h-40 rounded-full object-cover border-4 border-game-blue/50"
                />
                <div className="mt-4 text-center">
                  <p className="text-lg font-bold">
                    {currentUser?.global_name || currentUser?.username}
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="flex justify-between">
                  <span className="opacity-70">Guild:</span>
                  <span className="font-medium">{currentGuild?.name}</span>
                </p>
                <p className="flex justify-between">
                  <span className="opacity-70">Channel:</span>
                  <span className="font-medium">{currentChannel?.name}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Center - Game Controls */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-6">
            <Button
              disabled={!sdk?.channelId || !auth}
              onClick={() => router.push("/game?mode=ai")}
              className="w-1/2 bg-game-blue hover:bg-game-blue-light text-white"
              variant="default"
              size="lg"
            >
              Play Against AI
            </Button>
            <Button
              disabled={!sdk?.channelId || !auth}
              onClick={() => router.push("/game?mode=multiplayer")}
              className="w-1/2 bg-game-purple hover:bg-game-purple-light text-white"
              variant="default"
              size="lg"
            >
              Multiplayer Game
            </Button>
          </div>

          {/* Right Box - Participants */}
          <div className="w-1/5 min-w-[200px] bg-game-blue-dark/50 rounded-xl p-4 shadow-lg backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white mb-4 border-b border-game-blue-light/30 pb-2">
              Participants
            </h2>
            <div className="space-y-3 flex-1 overflow-y-auto pr-2">
              {participants?.participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center space-x-3 bg-game-blue/30 rounded-lg p-2 hover:bg-game-blue-light/30 transition-colors"
                >
                  <Image
                    src={
                      participant.avatar
                        ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png`
                        : "https://cdn.discordapp.com/embed/avatars/0.png"
                    }
                    width={40}
                    height={40}
                    alt={"User Avatar"}
                    className="rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {participant.global_name || participant.username}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Game Invite Modal */}
      {gameInvite && (
        <GameInvite
          inviter={gameInvite.inviter}
          onAccept={() => handleInviteResponse(true)}
          onDecline={() => handleInviteResponse(false)}
        />
      )}
    </main>
  );
}
