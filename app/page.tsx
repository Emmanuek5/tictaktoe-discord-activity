"use client";

import { useDiscordContext } from "@/contexts/DiscordContext";
import { useEffect, useState } from "react";
import { ParticipantsResponse } from "@/types/discord";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { io } from "socket.io-client";
import { GameInvite } from "@/components/GameInvite";
import { UserStats } from "@/components/UserStats";
import { motion, AnimatePresence } from "framer-motion";

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

    // Listen for user stats updates
    newSocket.on("userStats", (stats) => {
      console.log("stats", stats);

      setUserStats(stats);
    });

    // Request initial stats
    if (currentUser?.id) {
      newSocket.emit("requestStats", { userId: currentUser.id });
    }

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

  // Loading animation variants
  const loadingVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.2,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        damping: 12,
        stiffness: 200,
      },
    },
  };

  if (isLoading) {
    return (
      <motion.div
        animate="visible"
        variants={loadingVariants}
        className="flex items-center justify-center w-screen h-screen bg-gradient-to-br from-slate-900 to-slate-800"
      >
        <motion.div variants={itemVariants} className="flex items-center gap-4">
          <motion.h1 className="text-2xl font-bold text-white animate-pulse">
            Loading
          </motion.h1>
          <motion.div
            variants={itemVariants}
            className="h-8 w-8 animate-spin rounded-full border-4 border-slate-500 border-t-transparent"
          ></motion.div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="text-white overflow-hidden flex flex-col h-screen w-screen bg-gradient-to-br from-slate-900 to-slate-800"
    >
      <div className="flex flex-col h-full p-4 bg-black/30 backdrop-blur-sm">
        <motion.h1
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="text-3xl font-extrabold text-center mb-4 text-white"
        >
          Tictactoe Showdown
        </motion.h1>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Left Box - User Data */}
          <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="flex flex-col gap-4 w-1/5 min-w-[200px]"
          >
            {/* User Profile Box */}
            <div className="bg-white/5 rounded-xl p-4 shadow-lg backdrop-blur-sm border border-white/10">
              <h2 className="text-xl font-semibold text-white mb-4 border-b border-white/30 pb-2">
                Player Profile
              </h2>
              <div className="space-y-4">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="flex flex-col items-center"
                >
                  <Image
                    src={
                      currentUser?.avatar
                        ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
                        : "https://cdn.discordapp.com/embed/avatars/0.png"
                    }
                    width={80}
                    height={80}
                    alt={"User Avatar"}
                    className="rounded-full border-2 border-white/50"
                  />
                  <div className="mt-2 text-center">
                    <p className="font-semibold">
                      {currentUser?.global_name || currentUser?.username}
                    </p>
                  </div>
                </motion.div>
                <div className="space-y-2 text-sm">
                  <p className="flex justify-between items-center bg-white/5 p-2 rounded">
                    <span className="opacity-70">Guild</span>
                    <span className="font-medium">{currentGuild?.name}</span>
                  </p>
                  <p className="flex justify-between items-center bg-white/5 p-2 rounded">
                    <span className="opacity-70">Channel</span>
                    <span className="font-medium">{currentChannel?.name}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Stats Box */}
            {userStats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="bg-white/5 rounded-xl p-4 shadow-lg backdrop-blur-sm border border-white/10"
              >
                <h2 className="text-xl font-semibold text-white mb-4 border-b border-white/30 pb-2">
                  Game Statistics
                </h2>

                {/* Overall Stats */}
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-lg p-3">
                    <h3 className="text-sm font-medium mb-2 text-white/70">
                      Overall Games
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold">
                          {userStats.totalGames}
                        </p>
                        <p className="text-xs opacity-70">Total Games</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">
                          {(
                            (userStats.wins / userStats.totalGames) * 100 || 0
                          ).toFixed(1)}
                          %
                        </p>
                        <p className="text-xs opacity-70">Win Rate</p>
                      </div>
                    </div>
                  </div>

                  {/* Game Results */}
                  <div className="bg-white/5 rounded-lg p-3">
                    <h3 className="text-sm font-medium text-white/70 mb-2">
                      Game Results
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <p className="text-xl font-bold text-green-400">
                          {userStats.wins}
                        </p>
                        <p className="text-xs opacity-70">Wins</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-red-400">
                          {userStats.losses}
                        </p>
                        <p className="text-xs opacity-70">Losses</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-yellow-400">
                          {userStats.draws}
                        </p>
                        <p className="text-xs opacity-70">Draws</p>
                      </div>
                    </div>
                  </div>

                  {/* AI Games */}
                  <div className="bg-white/5 rounded-lg p-3">
                    <h3 className="text-sm font-medium mb-2 text-white/70">
                      AI Games
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center">
                        <p className="text-xl font-bold">
                          {userStats.aiGamesPlayed}
                        </p>
                        <p className="text-xs opacity-70">Total AI Games</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold">
                          {(
                            (userStats.aiWins / userStats.aiGamesPlayed) *
                              100 || 0
                          ).toFixed(1)}
                          %
                        </p>
                        <p className="text-xs opacity-70">AI Win Rate</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Center - Game Controls */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="flex-1 flex flex-col items-center justify-center space-y-8 px-8"
          >
            <div className="w-full max-w-md space-y-8">
              {/* Title Section */}
              <div className="text-center mb-8">
                <motion.h2
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-4xl font-bold
                   mb-2"
                >
                  Choose Game Mode
                </motion.h2>
                <motion.p
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-gray-400"
                >
                  Challenge AI or play against friends
                </motion.p>
              </div>

              {/* Game Mode Buttons */}
              <div className="space-y-6">
                {/* AI Game Button */}
                <Button
                  disabled={!sdk?.channelId || !auth}
                  onClick={() => router.push("/game?mode=ai")}
                  className="w-full h-20 bg-indigo-600 hover:bg-indigo-700 text-white text-xl font-bold transition-all duration-300 transform hover:scale-105"
                  variant="default"
                  size="lg"
                  asChild
                >
                  <motion.div
                    className="w-full h-full flex items-center justify-center gap-3"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg
                      className="w-8 h-8"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                    Play Against AI
                  </motion.div>
                </Button>

                {/* Multiplayer Button */}
                <Button
                  disabled={!sdk?.channelId || !auth}
                  onClick={() => router.push("/game?mode=multiplayer")}
                  className="w-full h-20 bg-violet-600 hover:bg-violet-700 text-white text-xl font-bold transition-all duration-300 transform hover:scale-105"
                  variant="default"
                  size="lg"
                  asChild
                >
                  <motion.div
                    className="w-full h-full flex items-center justify-center gap-3"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg
                      className="w-8 h-8"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    Multiplayer Game
                  </motion.div>
                </Button>
              </div>

              {/* Status Message */}
              {(!sdk?.channelId || !auth) && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-red-400 mt-4"
                >
                  Please connect to Discord to play
                </motion.p>
              )}
            </div>
          </motion.div>

          {/* Right Box - Participants */}
          <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="w-1/5 min-w-[200px] bg-white/5 rounded-xl p-4 shadow-lg backdrop-blur-sm border border-white/10"
          >
            <h2 className="text-xl font-semibold text-white mb-4 border-b border-white/30 pb-2">
              Participants
            </h2>
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    delayChildren: 0.2,
                    staggerChildren: 0.1,
                  },
                },
              }}
              className="space-y-3 flex-1 overflow-y-auto pr-2"
            >
              <AnimatePresence>
                {participants?.participants.map((participant) => (
                  <motion.div
                    key={participant.id}
                    variants={{
                      hidden: { y: 20, opacity: 0 },
                      visible: {
                        y: 0,
                        opacity: 1,
                        transition: {
                          type: "spring",
                          damping: 12,
                          stiffness: 200,
                        },
                      },
                    }}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="flex items-center space-x-3 bg-white/5 rounded-lg p-2 hover:bg-white/10 transition-colors"
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
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Game Invite Modal */}
      <AnimatePresence>
        {gameInvite && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <GameInvite
              inviter={gameInvite.inviter}
              onAccept={() => handleInviteResponse(true)}
              onDecline={() => handleInviteResponse(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
