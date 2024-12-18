"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { io } from "socket.io-client";
import { GameState } from "@/server/types";
import { ParticipantsResponse, DiscordParticipant } from "@/types/discord";
import { GameBoard } from "@/components/GameBoard";
import { ParticipantList } from "@/components/ParticipantList";
import { PlayerSelect } from "@/components/PlayerSelect";
import { GameInvite } from "@/components/GameInvite";
import { useSearchParams, useRouter } from "next/navigation";
import { useDiscordContext } from "@/contexts/DiscordContext";
import { MoveLeft, Bot, Loader2, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

const AI_PARTICIPANT: DiscordParticipant = {
  id: "AI",
  username: "AI Bot",
  discriminator: "0000",
  bot: true,
  flags: 0,
  avatar: null,
  global_name: "🤖 AI Opponent",
};

function GamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAIGame, setIsAIGame] = useState(false);
  const { currentUser, sdk } = useDiscordContext();

  const [socket, setSocket] = useState<any>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [participants, setParticipants] = useState<ParticipantsResponse | null>(
    null
  );
  const [gameInvite, setGameInvite] = useState<{
    inviter: DiscordParticipant;
    inviteId: string;
  } | null>(null);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<
    DiscordParticipant[]
  >([]);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    const mode = searchParams.get("mode");
    setIsAIGame(mode === "ai");
  }, [searchParams]);

  useEffect(() => {
    if (!sdk) return;

    const handleParticipantsUpdate = (e: ParticipantsResponse) => {
      console.log("Discord participants update:", e);
      if (socket && currentUser) {
        socket.emit("updateParticipants", {
          channelId: sdk.channelId,
          participants: e.participants,
          isAIGame,
        });
      }
    };

    const waitForParticipants = async () => {
      sdk.subscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantsUpdate
      );
    };

    waitForParticipants();

    sdk.commands.getInstanceConnectedParticipants().then((participants) => {
      if (socket && currentUser) {
        socket.emit("updateParticipants", {
          channelId: sdk.channelId,
          participants: participants.participants,
          isAIGame,
        });
      }
    });

    return () => {
      sdk.unsubscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantsUpdate
      );
    };
  }, [sdk, socket, currentUser, isAIGame]);

  useEffect(() => {
    const newSocket = io("", {
      path: "/.proxy/socket",
      transports: ["polling"],
      query: {
        channelId: sdk?.channelId,
        userId: currentUser?.id,
        username: currentUser?.username,
      },
      timeout: 5000,
    });
    setSocket(newSocket);

    //lets log all events
    newSocket.onAny((eventName, ...args) => {
      console.log(eventName, args);
    });

    newSocket.on("connect", () => {
      console.log("Connected to socket server");
      newSocket.emit("initializeSession", {
        channelId: sdk?.channelId,
        userId: currentUser?.id,
        username: currentUser?.username,
        isAIGame,
      });
    });

    newSocket.on(
      "sessionState",
      ({ participants, gameState, availableForGame }) => {
        if (isAIGame) {
          setParticipants({
            participants: [...participants, AI_PARTICIPANT],
          });
        } else {
          setParticipants({ participants });
        }

        if (gameState) setGameState(gameState);
        setAvailablePlayers(availableForGame || []);

        if (!isAIGame && availableForGame.length === 0) {
          setSessionError("Waiting for other players to join...");
        } else {
          setSessionError(null);
        }
      }
    );

    newSocket.on("gameState", (state: GameState) => {
      setGameState(state);
      setWaitingForResponse(false);
    });

    newSocket.on("gameInvite", ({ inviter, inviteId }) => {
      setGameInvite({ inviter, inviteId });
    });

    newSocket.on("inviteResponse", ({ accepted, inviterId }) => {
      if (accepted) {
        setWaitingForResponse(false);
      } else {
        setWaitingForResponse(false);
        alert("Player declined your invitation");
      }
    });

    return () => {
      newSocket.close();
      setGameState(null);
      setParticipants(null);
      setGameInvite(null);
      setWaitingForResponse(false);
      setSessionError(null);
    };
  }, [currentUser, sdk?.channelId, isAIGame, router]);

  const handleMove = useCallback(
    (position: number) => {
      if (socket && gameState && currentUser) {
        socket.emit("move", {
          position,
          player: gameState.players.X === currentUser.id ? "X" : "O",
          roomId: sdk?.channelId,
        });
      }
    },
    [socket, gameState, currentUser, sdk?.channelId]
  );

  const handleReset = useCallback(() => {
    if (socket && currentUser) {
      socket.emit("resetGame", {
        channelId: sdk?.channelId,
        userId: currentUser.id,
        isAIGame,
      });
    }
  }, [socket, currentUser, sdk?.channelId, isAIGame]);

  const handleInvitePlayer = useCallback(
    (playerId: string) => {
      if (socket && currentUser) {
        socket.emit("sendGameInvite", {
          inviterId: currentUser.id,
          inviteeId: playerId,
          channelId: sdk?.channelId,
        });
        setWaitingForResponse(true);
      }
    },
    [socket, currentUser, sdk?.channelId]
  );

  const handleInviteResponse = useCallback(
    (accepted: boolean) => {
      if (socket && gameInvite) {
        socket.emit("respondToInvite", {
          inviteId: gameInvite.inviteId,
          accepted,
          inviterId: gameInvite.inviter.id,
          inviteeId: currentUser?.id,
          channelId: sdk?.channelId,
        });
        setGameInvite(null);
      }
    },
    [socket, gameInvite, currentUser?.id, sdk?.channelId]
  );

  if (!participants || !currentUser) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <div className="bg-white/5 p-8 rounded-xl shadow-2xl border border-white/10 flex items-center gap-6">
          <Loader2 className="h-12 w-12 text-white/80 animate-spin" />
          <div className="text-white/90 text-2xl font-bold tracking-wide">
            Loading game...
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-screen w-full bg-gradient-to-br from-slate-900 to-slate-800 text-white"
    >
      <div className="w-full backdrop-blur-sm bg-black/20">
        {/* Header */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
          >
            <Button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700">
              <MoveLeft className="w-5 h-5" />
              <span>Back</span>{" "}
            </Button>
          </motion.button>
          <div className="flex items-center gap-2 text-white/80">
            {isAIGame ? (
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                <span>AI Mode</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/80">
                <Users className="w-5 h-5" />
                <span>Multiplayer Mode</span>
              </div>
            )}
          </div>
        </motion.div>

        <div className="container mx-auto p-4">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Left Side - Game Board */}
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="flex-1"
            >
              <div className="bg-white/5 rounded-xl p-4 backdrop-blur-sm shadow-xl border border-white/10">
                {gameState ? (
                  <GameBoard
                    gameState={gameState}
                    currentUserId={currentUser.id}
                    onMove={handleMove}
                    onReset={handleReset}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-4 p-8">
                    {sessionError ? (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-red-400/90 text-center"
                      >
                        {sessionError}
                      </motion.p>
                    ) : (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          ease: "linear",
                        }}
                      >
                        <Loader2 className="w-8 h-8 text-white/80" />
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>

            {/* Right Side - Players */}
            <motion.div
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="w-full md:w-80"
            >
              <div className="space-y-4">
                {/* Participants List */}
                <div className="bg-white/5 rounded-xl p-4 backdrop-blur-sm shadow-xl border border-white/10">
                  <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-white/10">
                    Players
                  </h2>
                  {participants && (
                    <ParticipantList
                      participants={participants}
                      currentUserId={currentUser.id}
                      gameState={gameState}
                    />
                  )}
                </div>

                {/* Player Selection */}
                {!gameState && !isAIGame && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/5 rounded-xl p-4 backdrop-blur-sm shadow-xl border border-white/10"
                  >
                    <h2 className="text-xl font-semibold mb-4 pb-2 border-b border-white/10">
                      Available Players
                    </h2>
                    <PlayerSelect
                      participants={participants}
                      currentUserId={currentUser.id}
                      onInvitePlayer={handleInvitePlayer}
                    />
                    {waitingForResponse && (
                      <p className="text-center text-sm text-white/60 mt-2">
                        Waiting for response...
                      </p>
                    )}
                  </motion.div>
                )}
              </div>
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
              className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-md"
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
    </motion.div>
  );
}

export default function Game() {
  return (
    <Suspense>
      <GamePage />
    </Suspense>
  );
}
