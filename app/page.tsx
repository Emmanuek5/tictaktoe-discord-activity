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
      },
      timeout: 5000,
    });

    setSocket(newSocket);

    newSocket.onAny((eventName, ...args) => {
      console.log(eventName, args);
    });

    // Request initial stats
    if (currentUser?.id) {
      newSocket.emit("requestStats", { userId: currentUser.id });
    }

    return () => {
      if (newSocket) {
        console.log("disconnecting socket");

        newSocket.disconnect();
      }
    };
  }, [currentUser?.id, sdk?.channelId]);

  // Handle game invites and stats
  useEffect(() => {
    if (!socket) return;

    socket.on("gameInvite", ({ inviter, inviteId }: any) => {
      setGameInvite({ inviter, inviteId });
    });

    socket.on("userStats", (stats: any) => {
      setUserStats(stats);

      const userStatsInterval = setInterval(() => {
        socket.emit("requestStats", { userId: currentUser?.id });
      }, 500000); // 5 minutes

      return () => {
        clearInterval(userStatsInterval);
      };
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

  return (
    <div className="h-screen bg-[#0f1117] text-white overflow-hidden">
      <AnimatePresence mode="wait">
        {gameMode === "menu" ? (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="h-full flex"
          >
            {/* Left sidebar with user stats */}
            <motion.div
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="w-80 p-6 border-r border-white/10"
            >
              <div className="space-y-6">
                {/* User Profile */}
                <div className="flex flex-col items-center space-y-4">
                  <Image
                    src={
                      currentUser?.avatar
                        ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
                        : "https://cdn.discordapp.com/embed/avatars/0.png"
                    }
                    width={80}
                    height={80}
                    alt="User Avatar"
                    className="rounded-full border-2 border-white/20"
                  />
                  <div className="text-center">
                    <h2 className="font-semibold text-lg">
                      {currentUser.global_name || currentUser.username}
                    </h2>
                    <p className="text-sm text-white/60">
                      {currentGuild?.name} • {currentChannel?.name}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                {userStats && (
                  <div className="space-y-4">
                    <div className="bg-white/5 rounded-lg p-4">
                      <h3 className="text-sm font-medium mb-3 text-white/70">
                        Overall Stats
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold">
                            {userStats.totalGames}
                          </p>
                          <p className="text-xs text-white/60">Games Played</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold">
                            {(
                              (userStats.wins / userStats.totalGames) * 100 || 0
                            ).toFixed(1)}
                            %
                          </p>
                          <p className="text-xs text-white/60">Win Rate</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-4">
                      <h3 className="text-sm font-medium mb-3 text-white/70">
                        Game Results
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center">
                          <p className="text-xl font-bold text-green-400">
                            {userStats.wins}
                          </p>
                          <p className="text-xs text-white/60">Wins</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-red-400">
                            {userStats.losses}
                          </p>
                          <p className="text-xs text-white/60">Losses</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-yellow-400">
                            {userStats.draws}
                          </p>
                          <p className="text-xs text-white/60">Draws</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-4">
                      <h3 className="text-sm font-medium mb-3 text-white/70">
                        AI Games
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <p className="text-xl font-bold">
                            {userStats.aiGamesPlayed}
                          </p>
                          <p className="text-xs text-white/60">Games vs AI</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold">
                            {(
                              (userStats.aiWins / userStats.aiGamesPlayed) *
                                100 || 0
                            ).toFixed(1)}
                            %
                          </p>
                          <p className="text-xs text-white/60">AI Win Rate</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Main content */}
            <div className="flex-1 flex items-center justify-center">
              <div className="max-w-md w-full space-y-12 p-8">
                <div className="text-center space-y-4">
                  <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-violet-500">
                    Tic Tac{" "}
                    <span className="text-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-rose-500">
                      Showdown
                    </span>
                  </h1>
                  <p className="text-lg text-white/60">
                    Challenge friends or test your skills against AI
                  </p>
                </div>

                <div className="space-y-4">
                  <Button
                    size="lg"
                    className="w-full h-16 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700"
                    onClick={() => setGameMode("pvp")}
                  >
                    <Users className="w-6 h-6 mr-3" />
                    Play with Friends
                  </Button>
                  <Button
                    size="lg"
                    className="w-full h-16 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
                    onClick={() => setGameMode("ai")}
                  >
                    <Bot className="w-6 h-6 mr-3" />
                    Play against AI
                  </Button>
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
              onBack={() => setGameMode("menu")}
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
              className="bg-[#1a1b26] p-6 rounded-xl border border-white/10 shadow-xl"
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
