"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
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

const POLL_INTERVAL = 1000; // Poll every second

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

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [participants, setParticipants] = useState<ParticipantsResponse | null>(null);
  const [gameInvite, setGameInvite] = useState<{
    inviter: DiscordParticipant;
    inviteId: string;
  } | null>(null);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<DiscordParticipant[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number>(0);

  useEffect(() => {
    const mode = searchParams.get("mode");
    setIsAIGame(mode === "ai");
  }, [searchParams]);

  useEffect(() => {
    if (!sdk) return;

    const handleParticipantsUpdate = async (e: ParticipantsResponse) => {
      console.log("Discord participants update:", e);
      if (currentUser && sdk.channelId) {
        try {
          await fetch('/api/session/participants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channelId: sdk.channelId,
              participants: e.participants,
              isAIGame
            })
          });
        } catch (error) {
          console.error('Failed to update participants:', error);
        }
      }
    };

    const waitForParticipants = async () => {
      sdk.subscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantsUpdate
      );
    };

    waitForParticipants();

    sdk.commands.getInstanceConnectedParticipants().then(async (participants) => {
      if (currentUser && sdk.channelId) {
        try {
          await fetch('/api/session/participants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              channelId: sdk.channelId,
              participants: participants.participants,
              isAIGame
            })
          });
        } catch (error) {
          console.error('Failed to update participants:', error);
        }
      }
    });

    return () => {
      sdk.unsubscribe(
        "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
        handleParticipantsUpdate
      );
    };
  }, [sdk, currentUser, isAIGame]);

  // Initialize session
  const initializeSession = useCallback(async () => {
    if (!currentUser || !sdk?.channelId) return;

    try {
      const response = await fetch('/api/session/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: sdk.channelId,
          userId: currentUser.id,
          username: currentUser.username,
          isAIGame,
          avatar: currentUser.avatar,
          global_name: currentUser.global_name
        })
      });

      if (!response.ok) throw new Error('Failed to initialize session');

      const { participants, gameState, availableForGame } = await response.json();
      
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
    } catch (error) {
      console.error('Failed to initialize session:', error);
      setSessionError("Failed to connect to game server");
    }
  }, [currentUser, sdk?.channelId, isAIGame]);

  // Poll for updates
  useEffect(() => {
    if (!currentUser || !sdk?.channelId) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/session/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: sdk.channelId,
            lastUpdate
          })
        });

        if (response.status === 304) return; // No changes

        if (!response.ok) throw new Error('Failed to poll for updates');

        const data = await response.json();
        
        if (isAIGame) {
          setParticipants({
            participants: [...data.participants, AI_PARTICIPANT],
          });
        } else {
          setParticipants({ participants: data.participants });
        }

        if (data.gameState) setGameState(data.gameState);
        setAvailablePlayers(data.availableForGame || []);
        setLastUpdate(data.lastUpdate);
        setWaitingForResponse(false);

        if (!isAIGame && data.availableForGame.length === 0) {
          setSessionError("Waiting for other players to join...");
        } else {
          setSessionError(null);
        }
      } catch (error) {
        console.error('Failed to poll for updates:', error);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [currentUser, sdk?.channelId, lastUpdate, isAIGame]);

  // Initialize session on mount
  useEffect(() => {
    if (!currentUser) {
      router.push("/");
      return;
    }

    initializeSession();

    return () => {
      setGameState(null);
      setParticipants(null);
      setGameInvite(null);
      setWaitingForResponse(false);
      setSessionError(null);
    };
  }, [currentUser, router, initializeSession]);

  const handleMove = useCallback(async (position: number) => {
    if (!gameState || !currentUser || !sdk?.channelId) return;

    try {
      const response = await fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position,
          player: gameState.players.X === currentUser.id ? "X" : "O",
          roomId: sdk.channelId
        })
      });

      if (!response.ok) throw new Error('Failed to make move');

      const { gameState: newGameState } = await response.json();
      setGameState(newGameState);
    } catch (error) {
      console.error('Failed to make move:', error);
    }
  }, [gameState, currentUser, sdk?.channelId]);

  const handleReset = useCallback(async () => {
    if (!currentUser || !sdk?.channelId) return;

    try {
      const response = await fetch('/api/game/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: sdk.channelId,
          userId: currentUser.id,
          isAIGame
        })
      });

      if (!response.ok) throw new Error('Failed to reset game');

      const { gameState: newGameState } = await response.json();
      setGameState(newGameState);
    } catch (error) {
      console.error('Failed to reset game:', error);
    }
  }, [currentUser, sdk?.channelId, isAIGame]);

  const handleInvitePlayer = useCallback(async (playerId: string) => {
    if (!currentUser || !sdk?.channelId) return;

    try {
      setWaitingForResponse(true);
      const response = await fetch('/api/game/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviterId: currentUser.id,
          inviteeId: playerId,
          channelId: sdk.channelId
        })
      });

      if (!response.ok) {
        setWaitingForResponse(false);
        throw new Error('Failed to send game invite');
      }
    } catch (error) {
      console.error('Failed to send game invite:', error);
      setWaitingForResponse(false);
    }
  }, [currentUser, sdk?.channelId]);

  const handleInviteResponse = useCallback(
    (accepted: boolean) => {
      if (!gameInvite) return;

      try {
        fetch('/api/game/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inviteId: gameInvite.inviteId,
            accepted,
            inviterId: gameInvite.inviter.id,
            inviteeId: currentUser?.id,
            channelId: sdk?.channelId,
          }),
        });
        setGameInvite(null);
      } catch (error) {
        console.error('Failed to respond to invite:', error);
      }
    },
    [gameInvite, currentUser?.id, sdk?.channelId]
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
