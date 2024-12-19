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
    if (!currentUser?.id || !sdk?.channelId) return;

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

    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [currentUser?.id, sdk?.channelId]);

  // Handle game invites
  useEffect(() => {
    if (!socket) return;

    socket.on("gameInvite", ({ inviter, inviteId }: any) => {
      setGameInvite({ inviter, inviteId });
    });

    return () => {
      socket.off("gameInvite");
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
    return (
      <div className="h-screen flex items-center justify-center bg-[#0f1117]">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    );
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
            className="h-full flex items-center justify-center"
          >
            <div className="max-w-md w-full space-y-12 p-8">
              <div className="text-center space-y-4">
                <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-violet-500">
                  Tic Tac Toe
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

              <div className="text-center text-sm text-white/40">
                Connected as {currentUser.username}
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
