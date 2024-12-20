"use client";

import { useDiscordContext } from "@/contexts/DiscordContext";
import { useEffect, useState } from "react";
import { ParticipantsResponse } from "@/types/discord";
import { Button } from "@/components/ui/button";
import { io } from "socket.io-client";
import { GameInvite } from "@/components/GameInvite";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Users } from "lucide-react";
import Game from "@/components/Game";
import Image from "next/image";
import Loader from "@/components/Loader";

export default function Home() {
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
  const [gameMode, setGameMode] = useState<"menu" | "ai" | "pvp">("menu");
  const [socket, setSocket] = useState<any>(null);
  const [gameInvite, setGameInvite] = useState<{
    inviter: any;
    inviteId: string;
  } | null>(null);
  const [userStats, setUserStats] = useState<any>(null);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Remove fixed constraints for mobile responsiveness
      setPageSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle socket connection
  useEffect(() => {
    if (!currentChannel || !currentUser) return;

    const socketInstance = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000', {
      path: '/socket',
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected');
      
      // Send presence update
      socketInstance.emit('updatePresence', {
        userId: currentUser.id,
        username: currentUser.username,
        channelId: currentChannel.id,
        avatar: currentUser.avatar,
        global_name: currentUser.global_name
      });
    });

    // Handle participant updates
    socketInstance.on('participantUpdate', ({ participants, availableForGame }) => {
      setAvailablePlayers(availableForGame);
      setParticipants(participants);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [currentChannel, currentUser]);

  // Send periodic presence updates
  useEffect(() => {
    if (!socket || !currentChannel || !currentUser) return;

    const interval = setInterval(() => {
      socket.emit('updatePresence', {
        userId: currentUser.id,
        username: currentUser.username,
        channelId: currentChannel.id,
        avatar: currentUser.avatar,
        global_name: currentUser.global_name
      });
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [socket, currentChannel, currentUser]);

  // Handle game invites and stats
  useEffect(() => {
    if (!socket) return;

    socket.on("gameInvite", ({ inviter, inviteId }: any) => {
      setGameInvite({ inviter, inviteId });
    });

    socket.on("userStats", (stats: any) => {
      setUserStats(stats);

      return () => {};
    });
  }, [socket]);

  const handleInviteResponse = async (accepted: boolean) => {
    if (!socket || !gameInvite) return;

    socket.emit("respondToInvite", {
      inviteId: gameInvite.inviteId,
      accepted,
      inviterId: gameInvite.inviter.id,
      inviteeId: currentUser?.id,
      channelId: sdk?.channelId,
    });

    if (accepted) {
      setGameMode("pvp");
    }

    setGameInvite(null);
  };

  if (isLoading || !currentUser) {
    return <Loader />;
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f1117]">
        <div className="text-red-500 text-2xl">Error: {error.message}</div>
      </div>
    );
  }

  const handleGameModeChange = (mode: "menu" | "ai" | "pvp") => {
    socket?.emit("requestStats", { userId: currentUser.id });
    setGameMode(mode);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f1117] text-white p-4">
      {gameMode === "menu" ? (
        <div className="flex flex-col items-center space-y-8">
          <h1 className="text-4xl font-bold mb-8">Choose Game Mode</h1>
          
          {/* Display available players */}
          {participants && participants.length > 0 && (
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-semibold mb-4">Players in Channel</h2>
              <div className="flex flex-wrap justify-center gap-4">
                {participants.map((participant) => (
                  <div
                    key={participant.id}
                    className={`flex items-center space-x-2 p-3 rounded-lg ${
                      participant.status === 'online' ? 'bg-green-600' :
                      participant.status === 'ingame' ? 'bg-blue-600' :
                      'bg-gray-600'
                    }`}
                  >
                    {participant.avatar && (
                      <Image
                        src={`https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png`}
                        alt={participant.username}
                        width={32}
                        height={32}
                        className="rounded-full"
                      />
                    )}
                    <span>{participant.global_name || participant.username}</span>
                    <span className="text-xs">
                      {participant.status === 'online' ? '(Available)' :
                       participant.status === 'ingame' ? '(In Game)' :
                       '(Offline)'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-8">
            <Button
              onClick={() => setGameMode("ai")}
              className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700"
            >
              <Bot className="w-5 h-5" />
              <span>Play vs AI</span>
            </Button>
            <Button
              onClick={() => setGameMode("pvp")}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700"
              disabled={!availablePlayers || availablePlayers.length === 0}
            >
              <Users className="w-5 h-5" />
              <span>Play vs Player {availablePlayers && availablePlayers.length > 0 ? `(${availablePlayers.length} Available)` : '(No Players Available)'}</span>
            </Button>
          </div>
        </div>
      ) : (
        <Game
          mode={gameMode === "ai" ? "ai" : "pvp"}
          onBack={() => handleGameModeChange("menu")}
          inviteData={gameInvite}
        />
      )}
    </div>
  );
}
