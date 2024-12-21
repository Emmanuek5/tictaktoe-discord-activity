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
    <div className="min-h-screen bg-[#000000] text-white overflow-auto relative">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#33ff3305_1px,transparent_1px),linear-gradient(to_bottom,#33ff3305_1px,transparent_1px)] bg-[size:14px_24px]" />
      
      {/* Radial Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_-30%,#33ff3330,transparent)]" />

      {/* Animated Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating squares */}
        <div className="absolute -left-4 top-1/4 w-24 h-24 border border-[#33ff33]/20 rotate-45 animate-float-slow" />
        <div className="absolute right-1/4 top-1/3 w-16 h-16 border border-[#33ff33]/30 rotate-12 animate-float-medium" />
        <div className="absolute left-1/3 bottom-1/4 w-20 h-20 border border-[#33ff33]/25 -rotate-12 animate-float-fast" />
        
        {/* Glowing orbs */}
        <div className="absolute left-1/4 top-1/4 w-32 h-32 rounded-full bg-[#33ff33] opacity-10 blur-3xl animate-pulse-slow" />
        <div className="absolute right-1/3 bottom-1/3 w-40 h-40 rounded-full bg-[#33ff33] opacity-10 blur-3xl animate-pulse-medium" />
      </div>

      {/* Scanlines */}
      <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,#33ff3308_50%,transparent_100%)] bg-[size:100%_4px] animate-scan" />

      {/* Sound Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <SoundToggle />
      </div>

      <AnimatePresence mode="wait">
        {gameMode === "menu" ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="min-h-screen flex flex-col md:flex-row relative"
          >
            {/* Left sidebar with user stats */}
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="w-full md:w-80 p-4 md:p-6 border-b md:border-b-0 md:border-r border-[#33ff33] bg-[#000000]/80 backdrop-blur-sm relative z-10"
            >
              <div className="space-y-4 md:space-y-6">
                {/* User Profile */}
                <div className="flex md:flex-col items-center space-x-4 md:space-x-0 md:space-y-4">
                  <div className="relative">
                    <Image
                      src={
                        currentUser?.avatar
                          ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
                          : "https://cdn.discordapp.com/embed/avatars/0.png"
                      }
                      width={60}
                      height={60}
                      alt="User Avatar"
                      className="rounded-full border-2 border-[#33ff33] md:w-20 md:h-20"
                    />
                  </div>
                  <div className="text-left md:text-center">
                    <h2 className="font-arcade text-base md:text-lg text-[#33ff33]">
                      {currentUser.global_name || currentUser.username}
                    </h2>
                    <p className="font-arcade text-xs text-[#33ff33]/60">
                      {currentGuild?.name} • {currentChannel?.name}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                {userStats && (
                  <div className="space-y-4 md:space-y-6">
                    <div className="bg-[#111111] rounded-none border-2 border-[#33ff33] p-4 md:p-6">
                      <h3 className="font-arcade text-sm mb-3 text-[#33ff33]">
                        PLAYER STATS
                      </h3>
                      <div className="grid grid-cols-2 gap-4 md:gap-6">
                        <div className="text-center">
                          <p className="font-arcade text-2xl text-[#ffff00]">
                            {userStats.totalGames}
                          </p>
                          <p className="font-arcade text-xs text-[#33ff33]">
                            GAMES
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="font-arcade text-2xl text-[#ffff00]">
                            {(
                              (userStats.wins / userStats.totalGames) * 100 || 0
                            ).toFixed(0)}
                            %
                          </p>
                          <p className="font-arcade text-xs text-[#33ff33]">
                            WIN RATE
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#111111] rounded-none border-2 border-[#33ff33] p-4 md:p-6">
                      <h3 className="font-arcade text-sm mb-3 text-[#33ff33]">
                        RESULTS
                      </h3>
                      <div className="grid grid-cols-3 gap-2 md:gap-4">
                        <div className="text-center">
                          <p className="font-arcade text-xl text-[#33ff33]">
                            {userStats.wins}
                          </p>
                          <p className="font-arcade text-xs text-[#33ff33]">
                            WINS
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="font-arcade text-xl text-[#ff4444]">
                            {userStats.losses}
                          </p>
                          <p className="font-arcade text-xs text-[#33ff33]">
                            LOSS
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="font-arcade text-xl text-[#ffff00]">
                            {userStats.draws}
                          </p>
                          <p className="font-arcade text-xs text-[#33ff33]">
                            DRAW
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
                          <p className="font-arcade text-xl text-[#ffff00]">
                            {userStats.aiGamesPlayed}
                          </p>
                          <p className="font-arcade text-xs text-[#33ff33]">
                            VS AI
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="font-arcade text-xl text-[#ffff00]">
                            {(
                              (userStats.aiWins / userStats.aiGamesPlayed) *
                                100 || 0
                            ).toFixed(0)}
                            %
                          </p>
                          <p className="font-arcade text-xs text-[#33ff33]">
                            AI WINS
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Main content */}
            <div className="flex-1 flex items-center justify-center bg-[#000000] bg-opacity-95 relative">
              <div className="max-w-md w-full space-y-12 p-8 md:p-12">
                <div className="text-center space-y-4">
                  <h1 className="font-arcade text-5xl tracking-wide leading-relaxed [text-shadow:0_0_10px_#33ff33]">
                    <span className="text-[#33ff33]">
                      TIC TAC
                    </span>{" "}
                    <br />
                    <span className="text-[#33ff33]">
                      SHOWDOWN
                    </span>
                  </h1>
                  <p className="font-arcade text-sm md:text-base text-[#33ff33] animate-blink">
                    INSERT COIN TO PLAY
                  </p>
                </div>

                <div className="space-y-4 md:space-y-6">
                  <Button
                    size="lg"
                    className="w-full h-16 md:h-20 font-arcade text-lg bg-[#000000] border-2 border-[#33ff33] text-[#33ff33] 
                      hover:bg-[#33ff33]/10 hover:shadow-[0_0_10px_#33ff33] transition-all duration-300 group relative overflow-hidden"
                    onClick={() => {
                      handleGameModeChange("pvp");
                      soundManager?.playSound("click");
                    }}
                  >
                    {/* Button glow effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute inset-0 bg-[#33ff33] blur-2xl opacity-20" />
                    </div>
                    <span className="relative z-10 flex items-center justify-center">
                      <Users className="w-6 h-6 mr-3" />2 PLAYERS
                    </span>
                  </Button>
                  
                  <Button
                    size="lg"
                    className="w-full h-16 md:h-20 font-arcade text-lg bg-[#000000] border-2 border-[#33ff33] text-[#33ff33] 
                      hover:bg-[#33ff33]/10 hover:shadow-[0_0_10px_#33ff33] transition-all duration-300 group relative overflow-hidden"
                    onClick={() => {
                      handleGameModeChange("ai");
                      soundManager?.playSound("click");
                    }}
                  >
                    {/* Button glow effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="absolute inset-0 bg-[#33ff33] blur-2xl opacity-20" />
                    </div>
                    <span className="relative z-10 flex items-center justify-center">
                      <Bot className="w-6 h-6 mr-3" />VS AI
                    </span>
                  </Button>
                </div>

                <div className="text-center">
                  <p className="font-arcade text-xs text-[#33ff33] animate-pulse">
                    HIGH SCORE: {userStats?.wins || 0}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="game"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="h-full"
          >
            <Game
              mode={gameMode === "ai" ? "ai" : "pvp"}
              onBack={() => {
                handleGameModeChange("menu");
                soundManager?.playSound("click");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Invite Modal */}
      <AnimatePresence>
        {gameInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#000000] border-2 border-[#33ff33] p-6 rounded-xl shadow-[0_0_10px_#33ff33]"
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
