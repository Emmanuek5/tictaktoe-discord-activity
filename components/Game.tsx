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

    sdk.commands.getInstanceConnectedParticipants().then((participants) => {
      if (socket && currentUser) {
        socket.emit("updateParticipants", {
          channelId: sdk.channelId,
          participants: participants.participants,
          isAIGame,
        });
      }
    });

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
    <div className="flex h-screen">
      {/* Left Sidebar - Player Profile */}
      <div className="w-80 bg-[#1a1b26]/80 p-6 border-r border-white/10">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Player Profile</h2>
          <div className="flex flex-col items-center space-y-4">
            <div className="w-24 h-24 rounded-full overflow-hidden">
              <img
                src={
                  currentUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
                    : "https://cdn.discordapp.com/embed/avatars/0.png"
                }
                alt={currentUser.username}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-white">
                {currentUser.username}
              </h3>
            </div>
          </div>

          <div className="space-y-2 mt-6">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Guild</span>
              <span className="text-white">Advanced Support Server</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/60">Channel</span>
              <span className="text-white flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                general
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-[#0f1117]">
        {/* Header */}
        <div className="h-16 bg-[#1a1b26]/80 border-b border-white/10 flex items-center justify-between px-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white/80 hover:text-white"
          >
            <MoveLeft className="w-5 h-5 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {isAIGame ? (
              <Button variant="ghost" size="sm" className="text-white/80">
                <Bot className="w-5 h-5 mr-2" />
                AI Mode
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="text-white/80">
                <Users className="w-5 h-5 mr-2" />
                Multiplayer Mode
              </Button>
            )}
          </div>
        </div>

        {/* Game Area */}
        <div className="flex-1 flex">
          {/* Game Board */}
          <div className="flex-1 p-8">
            <div className="max-w-2xl mx-auto">
              {gameState ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-white/60">🎮</span>
                      <span className="text-white font-medium">Your Turn!</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/60">You:</span>
                      <span className="text-white font-medium">
                        {gameState.players.X === currentUser.id ? "X" : "O"}
                      </span>
                      <span className="text-white/60">Current Turn:</span>
                      <span className="text-white font-medium">
                        {gameState.players[gameState.currentPlayer as keyof typeof gameState.players] === currentUser.id
                          ? "Your Turn"
                          : "Opponent's Turn"}
                      </span>
                    </div>
                  </div>
                  <GameBoard
                    gameState={gameState}
                    currentUserId={currentUser.id}
                    onMove={handleMove}
                    onReset={handleReset}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[500px] bg-[#1a1b26]/50 rounded-xl border border-white/10">
                  {sessionError ? (
                    <p className="text-red-400/90 text-center">
                      {sessionError}
                    </p>
                  ) : (
                    <Loader2 className="w-8 h-8 text-white/80 animate-spin" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Players */}
          <div className="w-80 bg-[#1a1b26]/80 border-l border-white/10 p-6">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">
                  Players
                </h2>
                {participants && (
                  <div className="space-y-3">
                    {participants.participants.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-white/5"
                      >
                        <div className="w-10 h-10 rounded-full overflow-hidden">
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
                          <div className="text-white font-medium">
                            {participant.username}
                          </div>
                          {gameState?.players && (
                            <div className="text-sm text-white/60">
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
                  <h2 className="text-xl font-semibold text-white mb-4">
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
