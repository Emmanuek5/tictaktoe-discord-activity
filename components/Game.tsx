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

    newSocket.on(
      "gameState",
      ({
        gameId: newGameId,
        state,
      }: {
        gameId: string;
        state: GameState | null;
      }) => {
        setGameId(newGameId);
        setGameState(state);
        setWaitingForResponse(false);
      }
    );

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
      if (newSocket) {
        console.log("Disconnecting socket...");
        newSocket.disconnect();
      }
      setGameState(null);
      setParticipants(null);
      setGameInvite(null);
      setWaitingForResponse(false);
      setSessionError(null);
    };
  }, [currentUser?.id, sdk?.channelId, isAIGame]);

  const handleMove = useCallback(
    (position: number) => {
      if (!socket || !gameState || !currentUser || !gameId) return;

      const playerRole = gameState.players.X === currentUser.id ? "X" : "O";
      if (gameState.currentPlayer !== playerRole) return;

      socket.emit("move", {
        position,
        player: playerRole,
        roomId: sdk?.channelId,
        gameId,
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
      <div className="min-h-screen bg-[#0f1117] p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-screen">
            <Loader2 className="w-8 h-8 animate-spin text-white/60" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            className="text-white/60 hover:text-white"
            onClick={onBack}
          >
            <MoveLeft className="w-5 h-5 mr-2" />
            Back to Menu
          </Button>
          <div className="flex items-center gap-2">
            <div className="text-white/60 text-sm md:text-base">
              {isAIGame ? "Playing vs AI" : "PvP Mode"}
            </div>
          </div>
        </div>

        {/* Main Game Area */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Game Board Section */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {gameState ? (
              <GameBoard
                gameState={gameState}
                currentUserId={currentUser.id}
                onMove={handleMove}
                onReset={handleReset}
              />
            ) : (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-white/60" />
              </div>
            )}
          </div>

          {/* Participants Section */}
          <div className="w-full lg:w-80 space-y-6">
            <div className="bg-white/5 rounded-lg p-4">
              <h2 className="text-lg md:text-xl font-semibold text-white mb-4">
                Players
              </h2>
              {participants && (
                <div className="space-y-3">
                  {participants.participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3 p-2 rounded-lg bg-white/5"
                    >
                      <div className="flex-shrink-0">
                        <img
                          src={
                            participant.avatar
                              ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png`
                              : "https://cdn.discordapp.com/embed/avatars/0.png"
                          }
                          alt={participant.username}
                          className="w-8 h-8 rounded-full"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="truncate text-sm font-medium text-white">
                            {participant.global_name || participant.username}
                          </div>
                          {gameState?.players && (
                            <div className="text-sm text-white/60 ml-2">
                              {gameState.players.X === participant.id ? "X" : "O"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!gameState && !isAIGame && (
              <div className="bg-white/5 rounded-lg p-4">
                <h2 className="text-lg md:text-xl font-semibold text-white mb-4">
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
              </div>
            )}
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

export default function Game({ mode, onBack }: GameProps) {
  return (
    <Suspense>
      <GameComponent mode={mode} onBack={onBack} />
    </Suspense>
  );
}
