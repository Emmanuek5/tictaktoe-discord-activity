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
import { cn } from "@/lib/utils";

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

    newSocket.on("gameState", ({ gameId: newGameId, state }) => {
      console.log("Received game state:", { newGameId, state });
      setGameId(newGameId);
      setGameState(state);
      setWaitingForResponse(false);
    });

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

  const isPlayerTurn = gameState?.currentPlayer === currentUser?.id;
  const isGameOver = gameState?.isDraw || !!gameState?.winner || false;

  const handleMove = useCallback(
    (position: number) => {
      if (!socket || !gameState || !currentUser || !gameId) return;

      const playerRole = gameState.players.X === currentUser.id ? "X" : "O";
      if (gameState.currentPlayer !== playerRole) return;

      socket.emit("move", {
        position,
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
      <div className="min-h-screen bg-[#0f1117] text-white p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center h-screen">
            <Loader2 className="w-8 h-8 text-white/80 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => {
              onBack();
              soundManager?.playSound("click");
            }}
            className="font-arcade text-sm px-4 py-2 border-2 border-purple-500/50 hover:border-purple-500 bg-purple-900/20 hover:bg-purple-900/40 transition-all duration-300"
          >
            ← BACK
          </button>
          <h1 className="font-arcade text-2xl text-center relative">
            {mode === "ai" ? "VS CPU" : "VS PLAYER"}
          </h1>
        </div>

        {/* Game Board */}
        <div className="aspect-square max-w-[500px] mx-auto">
          <div className="grid grid-cols-3 gap-2 h-full">
            {gameState?.board.map((cell, index) => (
              <button
                key={index}
                onClick={() => handleMove(index)}
                disabled={!!cell || isGameOver || !isPlayerTurn}
                className={cn(
                  "aspect-square flex items-center justify-center",
                  "border-2 border-purple-500/50 bg-purple-900/20",
                  "hover:border-purple-500 hover:bg-purple-900/40",
                  "transition-all duration-300 disabled:opacity-50",
                  "text-6xl font-arcade"
                )}
              >
                <span
                  className={cn(
                    "transform transition-all duration-300",
                    cell === "X" ? "text-blue-400" : "text-red-400",
                    !cell && "opacity-0 scale-0"
                  )}
                >
                  {cell}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Game Status */}
        <div className="mt-8 text-center space-y-4">
          <div className="font-arcade text-xl">
            {isGameOver ? (
              gameState?.winner ? (
                <span className="text-green-400">
                  {gameState.winner === (mode === "ai" ? "O" : "X")
                    ? "YOU WIN!"
                    : "YOU LOSE!"}
                </span>
              ) : (
                <span className="text-yellow-400">DRAW!</span>
              )
            ) : (
              <span className={!isPlayerTurn ? "opacity-50" : ""}>
                {isPlayerTurn ? "YOUR TURN" : "WAITING..."}
              </span>
            )}
          </div>

          {isGameOver && (
            <button
              onClick={() => {
                handleReset();
                soundManager?.playSound("click");
              }}
              className="font-arcade text-sm px-6 py-3 border-2 border-purple-500/50 hover:border-purple-500 bg-purple-900/20 hover:bg-purple-900/40 transition-all duration-300"
            >
              PLAY AGAIN
            </button>
          )}
        </div>
      </div>
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
