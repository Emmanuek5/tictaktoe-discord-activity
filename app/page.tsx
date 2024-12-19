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

interface GameModeState {
  type: "menu" | "ai" | "pvp";
  inviteData?: {
    inviterId: string;
    inviteId: string;
  };
}

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
  const [gameMode, setGameMode] = useState<GameModeState>({ type: "menu" });
  const [socket, setSocket] = useState<any>(null);
  const [gameInvite, setGameInvite] = useState<{
    inviter: any;
    inviteId: string;
  } | null>(null);
  const [userStats, setUserStats] = useState<any>(null);

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
      newSocket.emit("initializeSession", {
        channelId: sdk.channelId,
        userId: currentUser.id,
        username: currentUser.username,
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
      setGameMode({
        type: "pvp",
        inviteData: {
          inviterId: gameInvite.inviter.id,
          inviteId: gameInvite.inviteId,
        },
      });
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
    setGameMode({ type: mode });
  };

  return (
    <div className="h-screen bg-[#0f1117] text-white ">
      <AnimatePresence mode="wait">
        {gameMode.type === "menu" ? (
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
              className="w-full md:w-80 p-4 md:p-6 border-b md:border-b-0 md:border-r border-white/10"
            >
              <div className="space-y-4 md:space-y-6">
                {/* User Profile */}
                <div className="flex md:flex-col items-center space-x-4 md:space-x-0 md:space-y-4">
                  <Image
                    src={
                      currentUser?.avatar
                        ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
                        : "https://cdn.discordapp.com/embed/avatars/0.png"
                    }
                    width={60}
                    height={60}
                    alt="User Avatar"
                    className="rounded-full border-2 border-white/20 md:w-20 md:h-20"
                  />
                  <div className="text-left md:text-center">
                    <h2 className="font-semibold text-base md:text-lg">
                      {currentUser.global_name || currentUser.username}
                    </h2>
                    <p className="text-xs md:text-sm text-white/60">
                      {currentGuild?.name} • {currentChannel?.name}
                    </p>
                  </div>
                </div>

                {/* Stats */}
                {userStats && (
                  <div className="space-y-4 md:space-y-6">
                    <div className="bg-white/5 rounded-lg p-4 md:p-6">
                      <h3 className="text-sm font-medium mb-3 text-white/70">
                        Overall Stats
                      </h3>
                      <div className="grid grid-cols-2 gap-4 md:gap-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold">
                            {userStats.totalGames}
                          </p>
                          <p className="text-xs md:text-sm text-white/60">
                            Games Played
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold">
                            {(
                              (userStats.wins / userStats.totalGames) * 100 || 0
                            ).toFixed(1)}
                            %
                          </p>
                          <p className="text-xs md:text-sm text-white/60">
                            Win Rate
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-4 md:p-6">
                      <h3 className="text-sm font-medium mb-3 text-white/70">
                        Game Results
                      </h3>
                      <div className="grid grid-cols-3 gap-2 md:gap-4">
                        <div className="text-center">
                          <p className="text-xl font-bold text-green-400">
                            {userStats.wins}
                          </p>
                          <p className="text-xs md:text-sm text-white/60">
                            Wins
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-red-400">
                            {userStats.losses}
                          </p>
                          <p className="text-xs md:text-sm text-white/60">
                            Losses
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold text-yellow-400">
                            {userStats.draws}
                          </p>
                          <p className="text-xs md:text-sm text-white/60">
                            Draws
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-lg p-4 md:p-6">
                      <h3 className="text-sm font-medium mb-3 text-white/70">
                        AI Games
                      </h3>
                      <div className="grid grid-cols-2 gap-4 md:gap-6">
                        <div className="text-center">
                          <p className="text-xl font-bold">
                            {userStats.aiGamesPlayed}
                          </p>
                          <p className="text-xs md:text-sm text-white/60">
                            Games vs AI
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-bold">
                            {(
                              (userStats.aiWins / userStats.aiGamesPlayed) *
                                100 || 0
                            ).toFixed(1)}
                            %
                          </p>
                          <p className="text-xs md:text-sm text-white/60">
                            AI Win Rate
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Main content */}
            <div className="flex-1 flex items-center justify-center">
              <div className="max-w-md w-full space-y-12 p-8 md:p-12">
                <div className="text-center space-y-4">
                  <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-violet-500">
                    Tic Tac{" "}
                    <span className="text-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-rose-500">
                      Showdown
                    </span>
                  </h1>
                  <p className="text-lg md:text-xl text-white/60">
                    Challenge friends or test your skills against AI
                  </p>
                </div>

                <div className="space-y-4 md:space-y-6">
                  <Button
                    size="lg"
                    className="w-full h-16 md:h-20 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700"
                    onClick={() => handleGameModeChange("pvp")}
                  >
                    <Users className="w-6 h-6 mr-3" />
                    Play with Friends
                  </Button>
                  <Button
                    size="lg"
                    className="w-full h-16 md:h-20 bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
                    onClick={() => handleGameModeChange("ai")}
                  >
                    <Bot className="w-6 h-6 mr-3" />
                    Play against AI
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <Game
            key="game"
            mode={gameMode.type}
            inviteData={gameMode.inviteData}
            onBack={() => setGameMode({ type: "menu" })}
          />
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
