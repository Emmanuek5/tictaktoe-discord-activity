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
            className="min-h-screen flex flex-col md:flex-row"
          >
            {/* Left sidebar with user stats */}
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="w-full md:w-80 p-4 md:p-6 border-b md:border-b-0 md:border-r border-[#333333] bg-[#000000]"
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
                        CPU BATTLES
                      </h3>
                      <div className="grid grid-cols-2 gap-4 md:gap-6">
                        <div className="text-center">
                          <p className="font-arcade text-xl text-[#ffff00]">
                            {userStats.aiGamesPlayed}
                          </p>
                          <p className="font-arcade text-xs text-[#33ff33]">
                            VS CPU
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
                            CPU WINS
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Main content */}
            <div className="flex-1 flex items-center justify-center bg-[#000000] bg-opacity-95">
              <div className="max-w-md w-full space-y-12 p-8 md:p-12">
                <div className="text-center space-y-4">
                  <h1 className="font-arcade text-5xl tracking-wide leading-relaxed">
                    <span className="text-[#00ff00] drop-shadow-[0_0_2px_#00ff00]">
                      TIC TAC
                    </span>{" "}
                    <br />
                    <span className="text-[#ff0000] drop-shadow-[0_0_2px_#ff0000]">
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
                    className="w-full h-16 md:h-20 font-arcade text-lg bg-[#000000] border-2 border-[#4444ff] text-[#4444ff] hover:bg-[#4444ff] hover:text-black transition-all duration-300"
                    onClick={() => {
                      handleGameModeChange("pvp");
                      soundManager?.playSound("click");
                    }}
                  >
                    <Users className="w-6 h-6 mr-3" />2 PLAYERS
                  </Button>
                  <Button
                    size="lg"
                    className="w-full h-16 md:h-20 font-arcade text-lg bg-[#000000] border-2 border-[#ff4444] text-[#ff4444] hover:bg-[#ff4444] hover:text-black transition-all duration-300"
                    onClick={() => {
                      handleGameModeChange("ai");
                      soundManager?.playSound("click");
                    }}
                  >
                    <Bot className="w-6 h-6 mr-3" />
                    VS CPU
                  </Button>
                </div>

                <div className="text-center">
                  <p className="font-arcade text-xs text-[#ffff00] animate-pulse">
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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <GameInvite
              inviter={gameInvite.inviter}
              onAccept={() => handleInviteResponse(true)}
              onDecline={() => handleInviteResponse(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
