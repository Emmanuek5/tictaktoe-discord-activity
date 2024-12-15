"use client";

import { useEffect, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { GameState } from "@/server/types";
import { ParticipantsResponse, DiscordParticipant } from "@/types/discord";
import { GameBoard } from "@/components/GameBoard";
import { ParticipantList } from "@/components/ParticipantList";
import { PlayerSelect } from "@/components/PlayerSelect";
import { GameInvite } from "@/components/GameInvite";
import { useSearchParams, useRouter } from "next/navigation";
import { useDiscordContext } from "@/contexts/DiscordContext";

const AI_PARTICIPANT: DiscordParticipant = {
  id: "AI",
  username: "AI Bot",
  discriminator: "0000",
  bot: true,
  flags: 0,
  avatar: null,
  global_name: "🤖 AI Opponent",
};

export default function GamePage() {
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
    if (!currentUser) {
      router.push("/");
      return;
    }

    const newSocket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000"
    );
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected to socket server");
      newSocket.emit("initializeSession", {
        channelId: sdk?.channelId,
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
      <div className="min-h-screen flex items-center justify-center bg-game-blue-darker">
        <div className="flex items-center gap-4">
          <div className="text-white text-xl animate-pulse">
            Loading game...
          </div>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-game-purple border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-game-blue-darker p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">
        <div className="flex flex-col items-center justify-center">
          <div className="mb-8 flex items-center justify-between w-full">
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-game-blue-dark/50 hover:bg-game-blue-dark text-white transition-colors"
            >
              ← Back to Home
            </button>
            <h1 className="text-2xl font-bold text-white">
              {isAIGame ? "Playing against AI" : "Multiplayer Game"}
            </h1>
          </div>

          {sessionError ? (
            <div className="text-center text-white">
              <h2 className="text-2xl font-bold mb-4">{sessionError}</h2>
              <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-game-purple border-t-transparent"></div>
            </div>
          ) : !gameState ? (
            isAIGame ? (
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-4">
                  Starting AI Game...
                </h2>
                <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-game-purple border-t-transparent"></div>
              </div>
            ) : waitingForResponse ? (
              <div className="text-center text-white">
                <h2 className="text-2xl font-bold mb-4">
                  Waiting for Response...
                </h2>
                <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-game-purple border-t-transparent"></div>
              </div>
            ) : (
              <PlayerSelect
                participants={participants}
                currentUserId={currentUser.id}
                onInvitePlayer={handleInvitePlayer}
              />
            )
          ) : (
            <GameBoard
              gameState={gameState}
              currentUserId={currentUser.id}
              onMove={handleMove}
              onReset={handleReset}
            />
          )}
        </div>

        <div>
          <ParticipantList
            participants={participants}
            gameState={gameState}
            currentUserId={currentUser.id}
          />
        </div>
      </div>

      {gameInvite && (
        <GameInvite
          inviter={gameInvite.inviter}
          onAccept={() => handleInviteResponse(true)}
          onDecline={() => handleInviteResponse(false)}
        />
      )}
    </main>
  );
}
