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
import { soundManager } from "@/utils/sounds";
import { SoundToggle } from "@/components/ui/sound-toggle";

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
  const [participants, setParticipants] = useState<any[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);

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

  useEffect(() => {
    if (soundManager) {
      soundManager.startBackgroundMusic();
    }
    return () => {
      if (soundManager) {
        soundManager.stopBackgroundMusic();
      }
    };
  }, []);

  // Handle socket connection
  useEffect(() => {
    console.log("Initializing socket connection");

    if (!currentUser?.id || !sdk?.channelId) {
      console.log("Missing user ID or channel ID");
      return;
    }

    const newSocket = io("", {
      path: "/.proxy/socket",
      transports: ["websocket", "polling"],
      query: {
        channelId: sdk.channelId,
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        global_name: currentUser.global_name,
      },
      timeout: 5000,
    });

    setSocket(newSocket);

    newSocket.onAny((eventName, ...args) => {
      console.log("Socket Event:", eventName, args);
    });

    // Request initial session state
    if (currentUser?.id) {
      console.log("Emitting initializeSession", {
        channelId: sdk.channelId,
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        global_name: currentUser.global_name,
      });

      newSocket.emit("initializeSession", {
        channelId: sdk.channelId,
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        global_name: currentUser.global_name,
        isAIGame: false,
      });
      newSocket.emit("requestStats", { userId: currentUser.id });
    }

    return () => {
      if (newSocket) {
        console.log("disconnecting socket");
        newSocket.disconnect();
      }
    };
  }, [currentUser?.id, sdk?.channelId]);

  useEffect(() => {
    if (socket) {
      socket.on("gameStart", () => soundManager?.playSound("click"));
      socket.on("moveMade", () => soundManager?.playSound("move"));
      socket.on("gameWon", () => soundManager?.playSound("win"));
      socket.on("gameLost", () => soundManager?.playSound("lose"));
      socket.on("gameDraw", () => soundManager?.playSound("draw"));
      socket.on("gameInvite", () => soundManager?.playSound("invite"));
    }
  }, [socket]);

  // Handle session state updates
  useEffect(() => {
    if (!socket) return;

    socket.on(
      "sessionState",
      ({ participants: sessionParticipants, availableForGame }: any) => {
        console.log("Received sessionState:", {
          sessionParticipants,
          availableForGame,
        });
        setParticipants(sessionParticipants || []);
        setAvailablePlayers(availableForGame || []);
      }
    );

    socket.on("gameInvite", ({ inviter, inviteId }: any) => {
      setGameInvite({ inviter, inviteId });
    });

    socket.on("userStats", (stats: any) => {
      setUserStats(stats);
    });

    // Cleanup
    return () => {
      socket.off("sessionState");
      socket.off("gameInvite");
      socket.off("userStats");
    };
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
    <div className="relative min-h-screen bg-[#000000] text-white overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#33ff33]/5 to-transparent opacity-50 animate-pulse" />

      {/* Arcade decorations */}
      <div className="absolute top-0 left-0 w-32 h-32 bg-[#33ff33]/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-0 right-0 w-48 h-48 bg-[#33ff33]/10 rounded-full blur-3xl animate-float-delayed" />
      <div className="absolute top-1/4 right-1/4 w-24 h-24 bg-[#ffff33]/10 rounded-full blur-3xl animate-float" />

      {/* Scanline effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#33ff33]/10 to-transparent opacity-50 animate-scanline pointer-events-none" />

      {/* Glitch text effects */}
      <div className="absolute top-10 left-10 font-arcade text-[#33ff33]/20 text-6xl animate-glitch select-none">
        X O X
      </div>
      <div className="absolute bottom-10 right-10 font-arcade text-[#33ff33]/20 text-6xl animate-glitch-delayed select-none">
        O X O
      </div>

      {/* Sound toggle */}
      <div className="absolute top-4 right-4 z-50">
        <SoundToggle />
      </div>

      {/* Main content */}
      <div className="relative h-full flex flex-col items-center justify-center p-4">
        {/* User Profile */}
        <div className="absolute top-4 left-4 flex items-center gap-4 bg-[#111111] border-2 border-[#33ff33] p-4">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#33ff33]">
            {currentUser?.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`}
                alt={currentUser.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#111111] flex items-center justify-center">
                <Users className="w-6 h-6 text-[#33ff33]" />
              </div>
            )}
          </div>
          <div>
            <div className="font-arcade text-sm text-[#33ff33]">
              {currentUser?.global_name || currentUser?.username}
            </div>
            <div className="font-arcade text-xs text-[#33ff33]/70">
              {currentGuild?.name} • {currentChannel?.name}
            </div>
          </div>
        </div>

        {/* Game title */}
        <div className="text-center mb-12">
          <h1 className="font-arcade text-6xl md:text-8xl text-[#33ff33] drop-shadow-[0_0_10px_#33ff33]">
            TIC TAC TOE
          </h1>
          <div className="font-arcade text-[#33ff33] mt-2 animate-pulse">
            DISCORD ARCADE
          </div>
        </div>

        {gameMode === "menu" ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 p-4"
          >
            {/* Stats cards */}
            {userStats && (
              <div className="space-y-6">
                <div className="bg-[#111111] rounded-none border-2 border-[#33ff33] p-4 md:p-6">
                  <h3 className="font-arcade text-sm mb-3 text-[#33ff33]">
                    PLAYER STATS
                  </h3>
                  <div className="grid grid-cols-2 gap-4 md:gap-6">
                    <div className="text-center">
                      <p className="font-arcade text-2xl md:text-3xl text-[#33ff33]">
                        {userStats.totalGames}
                      </p>
                      <p className="font-arcade text-xs text-[#33ff33]">
                        TOTAL GAMES
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="font-arcade text-2xl md:text-3xl text-[#33ff33]">
                        {userStats.winRate}%
                      </p>
                      <p className="font-arcade text-xs text-[#33ff33]">
                        WIN RATE
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#111111] rounded-none border-2 border-[#33ff33] p-4 md:p-6">
                  <h3 className="font-arcade text-sm mb-3 text-[#33ff33]">
                    AI BATTLES
                  </h3>
                  <div className="grid grid-cols-2 gap-4 md:gap-6">
                    <div className="text-center">
                      <p className="font-arcade text-2xl md:text-3xl text-[#33ff33]">
                        {userStats.aiGamesPlayed}
                      </p>
                      <p className="font-arcade text-xs text-[#33ff33]">
                        VS AI
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="font-arcade text-2xl md:text-3xl text-[#33ff33]">
                        {userStats.aiWinRate}%
                      </p>
                      <p className="font-arcade text-xs text-[#33ff33]">
                        AI WINS
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#111111] rounded-none border-2 border-[#33ff33] p-4 md:p-6">
                  <h3 className="font-arcade text-sm mb-3 text-[#33ff33]">
                    PVP MATCHES
                  </h3>
                  <div className="grid grid-cols-2 gap-4 md:gap-6">
                    <div className="text-center">
                      <p className="font-arcade text-2xl md:text-3xl text-[#33ff33]">
                        {userStats.pvpGamesPlayed}
                      </p>
                      <p className="font-arcade text-xs text-[#33ff33]">
                        VS PLAYERS
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="font-arcade text-2xl md:text-3xl text-[#33ff33]">
                        {userStats.pvpWinRate}%
                      </p>
                      <p className="font-arcade text-xs text-[#33ff33]">
                        PVP WINS
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Game modes */}
            <div className="flex flex-col justify-center gap-4">
              <div className="font-arcade text-xl text-[#33ff33] mb-4 text-center">
                SELECT MODE
              </div>
              <Button
                variant="outline"
                size="lg"
                className="font-arcade text-[#33ff33] border-[#33ff33] hover:bg-[#33ff33]/10 h-16"
                onClick={() => {
                  handleGameModeChange("pvp");
                  soundManager?.playSound("click");
                }}
              >
                <Users className="w-6 h-6 mr-3" />
                VS PLAYER
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="font-arcade text-[#33ff33] border-[#33ff33] hover:bg-[#33ff33]/10 h-16"
                onClick={() => {
                  handleGameModeChange("ai");
                  soundManager?.playSound("click");
                }}
              >
                <Bot className="w-6 h-6 mr-3" />
                VS AI
              </Button>
            </div>
          </motion.div>
        ) : (
          <Game mode={gameMode} onBack={() => handleGameModeChange("menu")} />
        )}
      </div>

      {/* Game Invite Modal */}
      <AnimatePresence>
        {gameInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#111111] border-2 border-[#33ff33] p-6 rounded-none"
            >
              <GameInvite
                inviter={gameInvite.inviter}
                onAccept={() => handleInviteResponse(true)}
                onDecline={() => handleInviteResponse(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
