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
    if (state.winner) {
      const isWinner =
        state.players[state.winner as keyof typeof state.players] ===
        currentUser?.id;
      soundManager?.playSound(isWinner ? "win" : "lose");
    } else if (state.isDraw) {
      soundManager?.playSound("draw");
    }

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

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && socket) {
        console.log("Tab hidden, cleaning up socket");
        socket.disconnect();
      } else if (!document.hidden && !socket?.connected) {
        console.log("Tab visible, reconnecting socket");
        socket?.connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [socket]);

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
    <div className="h-screen bg-[#000000] text-white overflow-hidden">
      {/* Scanline effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#33ff33]/10 to-transparent opacity-50 animate-scanline pointer-events-none" />

      {/* Game content */}
      <div className="relative h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <Button
            variant="ghost"
            className="text-[#33ff33] hover:text-[#33ff33] hover:bg-[#33ff33]/10"
            onClick={onBack}
          >
            <MoveLeft className="w-6 h-6 mr-2" />
            BACK
          </Button>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-[#33ff33]" />
            <span className="font-arcade text-[#33ff33]">
              {participants.participants.length} PLAYER
              {participants.participants.length !== 1 ? "S" : ""}
            </span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex items-center justify-center">
          {gameState ? (
            <GameBoard
              gameState={gameState}
              currentUserId={currentUser.id}
              onMove={handleMove}
              onReset={handleReset}
            />
          ) : (
            <div className="flex flex-col items-center gap-6">
              {sessionError ? (
                <div className="text-center">
                  <div className="font-arcade text-[#ff3333] mb-2">
                    {sessionError}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="font-arcade text-[#33ff33] border-[#33ff33] hover:bg-[#33ff33]/10"
                  >
                    RETRY
                  </Button>
                </div>
              ) : (
                <PlayerSelect
                  participants={participants}
                  onInvitePlayer={handleInvitePlayer}
                  currentUserId={currentUser.id}
                />
              )}
            </div>
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
