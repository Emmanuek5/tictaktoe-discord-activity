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
import { ArcadeText } from "@/components/ui/arcade-text";

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
      <div className="flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center">
        <ArcadeText className="text-red-500">Error: {error.message}</ArcadeText>
      </div>
    );
  }

  const handleGameModeChange = (mode: "menu" | "ai" | "pvp") => {
    socket?.emit("requestStats", { userId: currentUser.id });
    setGameMode(mode);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24 bg-arcade-gradient">
      <SoundToggle />

      {gameMode === "menu" ? (
        <div className="space-y-6 text-center">
          <ArcadeText size="lg" glowColor="#4f46e5">
            TIC TAC TOE
          </ArcadeText>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              onClick={() => {
                setGameMode("ai");
                soundManager?.playSound("click");
              }}
              className="w-full p-6 text-xl font-arcade bg-purple-900/20 hover:bg-purple-900/40 backdrop-blur-sm border-2 border-purple-500/50 hover:border-purple-500 transition-all duration-300"
            >
              Play vs AI
            </Button>
            <Button
              onClick={() => {
                setGameMode("pvp");
                soundManager?.playSound("click");
              }}
              className="w-full p-6 text-xl font-arcade bg-purple-900/20 hover:bg-purple-900/40 backdrop-blur-sm border-2 border-purple-500/50 hover:border-purple-500 transition-all duration-300"
            >
              Play vs Player
            </Button>
          </div>
        </div>
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
            onBack={() => handleGameModeChange("menu")}
          />
        </motion.div>
      )}

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
    </main>
  );
}
