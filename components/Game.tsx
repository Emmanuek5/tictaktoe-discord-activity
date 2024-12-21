"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { io } from "socket.io-client";
import { GameState } from "@/server/types";
import { ParticipantsResponse, DiscordParticipant } from "@/types/discord";
import { GameBoard } from "@/components/GameBoard";
import { ParticipantList } from "@/components/ParticipantList";
import { PlayerSelect } from "@/components/PlayerSelect";
import { GameInvite } from "@/components/GameInvite";
import { useDiscordContext } from "@/contexts/DiscordContext";
import { MoveLeft, Bot, Loader2, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { soundManager } from "@/utils/sounds";

const AI_PARTICIPANT: DiscordParticipant = {
  id: "AI",
  username: "AI Bot",
  discriminator: "0000",
  bot: true,
  flags: 0,
  avatar: null,
  global_name: "🤖 AI Opponent",
};

interface GameProps {
  mode: "ai" | "pvp";
  onBack: () => void;
}

function GameComponent({ mode, onBack }: GameProps) {
  const [isAIGame, setIsAIGame] = useState(mode === "ai");
  const { currentUser, sdk } = useDiscordContext();

  const [socket, setSocket] = useState<any>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
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
    setIsAIGame(mode === "ai");
  }, [mode]);

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

    const waitForParticipantsUpdate = async () => {
      sdk.subscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantsUpdate
      );
    };

    const getParticipants = async () => {
      const participants =
        await sdk.commands.getInstanceConnectedParticipants();
      handleParticipantsUpdate(participants);
    };

    waitForParticipantsUpdate();
    getParticipants();

    return () => {
      sdk.unsubscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantsUpdate
      );
    };
  }, [sdk, socket, currentUser, isAIGame]);

  useEffect(() => {
    if (!currentUser?.id || !sdk?.channelId) return;

    const newSocket = io("", {
      path: "/.proxy/socket",
      transports: ["websocket", "polling"],
      query: {
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

    newSocket.on("connect", () => {
      console.log("Connected to socket server");
      newSocket.emit("initializeSession", {
        channelId: sdk.channelId,
        userId: currentUser.id,
        username: currentUser.username,
        isAIGame,
      });
    });

    newSocket.on(
      "sessionState",
      ({ participants, gameState, availableForGame }) => {
        console.log("Received session state:", {
          participants,
          gameState,
          availableForGame,
          isAIGame,
        });

        if (isAIGame) {
          setParticipants({
            participants: [...(participants || []), AI_PARTICIPANT],
          });
          setAvailablePlayers([AI_PARTICIPANT]);
        } else {
          setParticipants({ participants: participants || [] });
          setAvailablePlayers(availableForGame || []);
        }

        if (gameState) {
          setGameId(gameState.gameId);
          setGameState(gameState);
        }

        if (!isAIGame && (!availableForGame || availableForGame.length === 0)) {
          setSessionError("Waiting for other players to join...");
        } else {
          setSessionError(null);
        }
      }
    );

    newSocket.on("gameState", handleGameState);

    newSocket.on("gameInvite", ({ inviter, inviteId }) => {
      console.log("Received game invite:", { inviter, inviteId });
      setGameInvite({ inviter, inviteId });
    });

    newSocket.on("inviteResponse", ({ accepted, inviterId }) => {
      console.log("Received invite response:", { accepted, inviterId });
      if (accepted) {
        setWaitingForResponse(false);
      } else {
        setWaitingForResponse(false);
        alert("Player declined your invitation");
      }
    });

    newSocket.on("disconnect", () => {
      console.log("Socket disconnected");
      setSessionError("Connection lost. Reconnecting...");
    });

    newSocket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
      setSessionError("Connection error. Retrying...");
    });

    return () => {
      if (newSocket) {
        console.log("Cleaning up socket connection");
        newSocket.disconnect();
      }
      setGameState(null);
      setParticipants(null);
      setGameInvite(null);
      setWaitingForResponse(false);
      setSessionError(null);
    };
  }, [currentUser?.id, sdk?.channelId, isAIGame]);

  const handleGameState = ({
    gameId: newGameId,
    state,
  }: {
    gameId: string;
    state: GameState;
  }) => {
    console.log("Received game state:", { newGameId, state });

    // Handle game cleanup
    if (!state) {
      setGameState(null);
      setGameId(null);
      return;
    }

    setGameId(newGameId);
    setGameState(state);
    setWaitingForResponse(false);

    // Play appropriate sound for game end

    // Handle AI's turn with timing that matches server
    if (
      state.isAIGame &&
      state.currentPlayer === "O" &&
      !state.winner &&
      !state.isDraw
    ) {
      setWaitingForResponse(true);
      // Server has 1s delay for AI moves
      setTimeout(() => {
        if (!gameState?.winner && !gameState?.isDraw) {
          soundManager?.playSound("move");
        }
      }, 800); // Slightly before AI move to sync with animation
    }
  };

  // Handle user stats updates
  useEffect(() => {
    if (!socket) return;

    const handleUserStats = (stats: any) => {
      // Update any UI that shows user stats
      console.log("Received updated user stats:", stats);
    };

    socket.on("userStats", handleUserStats);

    return () => {
      socket.off("userStats", handleUserStats);
    };
  }, [socket]);

  // Handle game cleanup on unmount
  useEffect(() => {
    return () => {
      if (socket && gameId) {
        socket.emit("leaveGame", { gameId });
      }
    };
  }, [socket, gameId]);

  const handleMove = useCallback(
    (position: number) => {
      if (!socket || !gameState || !currentUser || !gameId) return;

      const playerRole = gameState.players.X === currentUser.id ? "X" : "O";
      if (gameState.currentPlayer !== playerRole) return;

      // Play move sound
      soundManager?.playSound("move");

      socket.emit("move", {
        position,
        roomId: sdk?.channelId,
        player: playerRole,
        gameId,
        channelId: sdk?.channelId,
      });
    },
    [socket, gameState, currentUser, sdk?.channelId, gameId]
  );

  const handleReset = useCallback(() => {
    if (!socket || !currentUser || !gameId) return;

    socket.emit("resetGame", {
      channelId: sdk?.channelId,
      userId: currentUser.id,
      isAIGame,
      gameId,
    });
  }, [socket, currentUser, sdk?.channelId, isAIGame, gameId]);

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
      <div className="relative min-h-screen bg-[#000000] text-white flex items-center justify-center overflow-hidden">
        {/* Scanline effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#33ff33]/10 to-transparent opacity-50 animate-scanline pointer-events-none" />

        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[#33ff33] animate-spin" />
          <div className="font-arcade text-[#33ff33] animate-pulse">
            {gameState?.isAIGame && gameState.currentPlayer === "O"
              ? "AI IS THINKING..."
              : "LOADING GAME..."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#000000] text-white p-4">
      {/* Scanline effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#33ff33]/10 to-transparent opacity-50 animate-scanline pointer-events-none" />

      <div className="max-w-6xl mx-auto">
        {/* Back button */}
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Button
            variant="outline"
            onClick={() => {
              onBack();
              soundManager?.playSound("click");
            }}
            className="mb-4 font-arcade bg-[#000000] border-2 border-[#33ff33] text-[#33ff33] hover:bg-[#33ff33] hover:text-black transition-colors duration-300"
          >
            <MoveLeft className="w-4 h-4 mr-2" />
            MAIN MENU
          </Button>
        </motion.div>

        {/* Game Area */}
        <div className="flex-1 flex">
          {/* Game Board */}
          <div className="flex-1 p-8">
            <div className="max-w-2xl mx-auto">
              {gameState ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4 font-arcade">
                    <div className="flex items-center gap-2 text-[#33ff33]">
                      <span>🎮</span>
                      <span>YOUR TURN!</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#33ff33]">
                      <span>YOU:</span>
                      <span>
                        {gameState.players.X === currentUser?.id ? "X" : "O"}
                      </span>
                      <span>TURN:</span>
                      <span>
                        {gameState.players[
                          gameState.currentPlayer as keyof typeof gameState.players
                        ] === currentUser?.id
                          ? "YOUR TURN"
                          : "OPPONENT'S TURN"}
                      </span>
                    </div>
                  </div>
                  <div className="bg-[#000000] border-2 border-[#33ff33] rounded-lg p-4 shadow-[0_0_10px_#33ff33]">
                    <GameBoard
                      gameState={gameState}
                      currentUserId={currentUser?.id!}
                      onMove={handleMove}
                      onReset={handleReset}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[500px] bg-[#000000] border-2 border-[#33ff33] rounded-lg p-4">
                  {sessionError ? (
                    <p className="text-[#ff0000] font-arcade text-center">
                      {sessionError}
                    </p>
                  ) : (
                    <Loader2 className="w-8 h-8 text-[#33ff33] animate-spin" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Players */}
          <div className="w-80 bg-[#000000] border-l-2 border-[#33ff33] p-6">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-arcade text-[#33ff33] mb-4">
                  PLAYERS
                </h2>
                {participants && (
                  <div className="space-y-3">
                    {participants.participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-[#000000] border border-[#33ff33]"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#33ff33]">
                          <img
                            src={
                              participant.avatar
                                ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png`
                                : "https://cdn.discordapp.com/embed/avatars/0.png"
                            }
                            alt={participant.username}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <div className="font-arcade text-[#33ff33]">
                            {participant.username}
                          </div>
                          {gameState?.players && (
                            <div className="text-sm text-[#ffff00] font-arcade">
                              {gameState.players.X === participant.id
                                ? "X"
                                : "O"}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!gameState && !isAIGame && (
                <div>
                  <h2 className="text-xl font-arcade text-[#33ff33] mb-4">
                    AVAILABLE PLAYERS
                  </h2>
                  <PlayerSelect
                    participants={participants!}
                    currentUserId={currentUser?.id!}
                    onInvitePlayer={handleInvitePlayer}
                  />
                  {waitingForResponse && (
                    <p className="text-center text-sm font-arcade text-[#33ff33] mt-2">
                      WAITING FOR RESPONSE...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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

export default function Game({ mode, onBack }: GameProps) {
  return (
    <Suspense>
      <GameComponent mode={mode} onBack={onBack} />
    </Suspense>
  );
}
