import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initDB, updateUserStats, getUserStats, logGameCompletion } from './db/postgres';
import { initRedis, saveGameState, getGameState, deleteGameState } from './db/redis';
import { createNewGame, makeMove } from './game';
import { GameMove, JoinGamePayload, GameState } from './types';
import { getBestMove } from './ai';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      /https:\/\/.*\.discordsays\.com$/,
    ],
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: '/socket',
  transports: ['websocket']
});

const PORT = process.env.SOCKET_PORT || 4000;

// Track active sessions and their participants
const activeSessions = new Map<string, {
  participants: Array<{
    id: string;
    username: string;
    avatar?: string;
    global_name?: string;
  }>;
  gameState: GameState | null;
}>();

// Initialize databases
async function init() {
  await Promise.all([initDB(), initRedis()]);
  console.log('Databases initialized');
}

init().catch(console.error);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let userChannelId: string | null = null;

  socket.on("initializeSession", async ({ channelId, userId, username, isAIGame }) => {
    userChannelId = channelId;

    let session = activeSessions.get(channelId);

    // Clear any existing game state when initializing a new session
    if (session) {
      session.gameState = null;
    } else {
      session = {
        participants: [],
        gameState: null,
      };
      activeSessions.set(channelId, session);
    }

    // Add the current user to participants if not already present
    if (!session.participants.find(p => p.id === userId)) {
      session.participants.push({
        id: userId,
        username,
        avatar: socket.handshake.query.avatar as string,
        global_name: socket.handshake.query.global_name as string
      });
    }

    // For AI games, create a new game state immediately
    if (isAIGame) {
      const gameState = {
        ...createNewGame(channelId),
        isAIGame: true,
        players: {
          X: userId,
          O: 'AI'
        }
      };
      session.gameState = gameState;
      await saveGameState(gameState);
      io.to(channelId).emit('gameState', gameState);
    }

    // Join the socket to the channel room
    socket.join(channelId);
    
    // Emit the current session state
    io.to(channelId).emit('sessionState', {
      participants: session.participants,
      gameState: session.gameState,
      availableForGame: session.participants.filter(p => p.id !== userId)
    });

    // Get and send user stats
    try {
      const stats = await getUserStats(userId);
      if (stats) {
        socket.emit('userStats', stats);
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  });

  socket.on('updateParticipants', ({ channelId, participants, isAIGame }) => {
    const session = activeSessions.get(channelId);
    if (!session) return;

    // Update session participants while preserving existing participant data
    const updatedParticipants = participants.map((newParticipant: any) => ({
      ...newParticipant,
      ...session.participants.find(p => p.id === newParticipant.id),
      avatar: newParticipant.avatar,
      global_name: newParticipant.global_name
    }));

    session.participants = updatedParticipants;

    // Get the current user's ID from the socket
    const currentUserId = session.participants.find(p => 
      p.id === socket.id || // Check socket ID
      session.gameState?.players.X === p.id || // Check if player X
      session.gameState?.players.O === p.id // Check if player O
    )?.id;

    // For AI games, only include the current user in participants
    const filteredParticipants = isAIGame 
      ? session.participants.filter(p => p.id === currentUserId)
      : session.participants;

    // Emit updated session state to all clients
    io.to(channelId).emit("sessionState", {
      participants: filteredParticipants,
      gameState: session.gameState,
      availableForGame: isAIGame 
        ? [] // No available players in AI mode
        : session.participants.filter(p => 
            p.id !== currentUserId && // Not the current user
            p.id !== (session.gameState?.players.X || null) && // Not already player X
            p.id !== (session.gameState?.players.O || null) // Not already player O
          )
    });
  });

  socket.on('resetGame', async ({ channelId, userId, isAIGame }) => {
    const session = activeSessions.get(channelId);
    if (!session) return;

    // Create new game state
    const gameState = {
      ...createNewGame(channelId),
      isAIGame,
      players: {
        X: userId,
        O: isAIGame ? 'AI' : null
      }
    };

    session.gameState = gameState;
    await saveGameState(gameState);
    io.to(channelId).emit('gameState', gameState);

    // If AI goes first, make the move
    if (isAIGame && gameState.currentPlayer === 'O') {
      const aiMove = getBestMove(gameState);
      handleMove({
        position: aiMove,
        player: 'O',
        roomId: channelId
      });
    }
  });

  const handleMove = async (move: GameMove) => {
    const session = activeSessions.get(move.roomId);
    if (!session?.gameState) return;

    const newGameState = makeMove(session.gameState, move);
    
    if (newGameState !== session.gameState) {
      session.gameState = newGameState;
      await saveGameState(newGameState);
      io.to(move.roomId).emit('gameState', newGameState);

      // Handle game over
      if (newGameState.winner || newGameState.isDraw) {
        const { players, isAIGame } = newGameState;
        
        try {
          // Log game completion
          await logGameCompletion({
            roomId: move.roomId,
            playerX: players.X || 'unknown',
            playerO: players.O || 'unknown',
            winner: newGameState.winner || undefined,
            isDraw: newGameState.isDraw,
            isAIGame,
            moves: newGameState.board.map((value, index) => ({
              position: index,
              player: value
            })).filter(move => move.player !== null)
          });

          // Emit updated stats to players
          const playerIds = [players.X, players.O].filter(id => id && id !== 'AI');
          for (const playerId of playerIds) {
            const stats = await getUserStats(playerId!);
            if (stats) {
              io.to(move.roomId).emit('userStats', stats);
            }
          }
        } catch (error) {
          console.error('Error handling game completion:', error);
        }

        // Clean up game state after delay
        setTimeout(async () => {
          if (session.gameState === newGameState) {
            session.gameState = null;
            await deleteGameState(move.roomId);
            io.to(move.roomId).emit('gameState', null);
          }
        }, 5000);
      }
      
      // If it's AI's turn, make the AI move
      if (!newGameState.winner && !newGameState.isDraw && 
          newGameState.isAIGame && 
          newGameState.currentPlayer === 'O' && 
          newGameState.players.O === 'AI') {
        setTimeout(async () => {
          const aiMove = getBestMove(newGameState);
          await handleMove({
            position: aiMove,
            player: 'O',
            roomId: move.roomId
          });
        }, 1000);
      }
    }
  };

  socket.on('move', handleMove);

  socket.on('disconnect', () => {
    if (userChannelId) {
      const session = activeSessions.get(userChannelId);
      if (session) {
        // Remove the disconnected user from participants
        session.participants = session.participants.filter(
          p => p.id !== socket.id
        );
        
        // If game is in progress and disconnected player was part of it, end the game
        if (session.gameState && 
           (session.gameState.players.X === socket.id || 
            session.gameState.players.O === socket.id)) {
          session.gameState = null;
        }

        // Notify remaining participants
        io.to(userChannelId).emit('sessionState', {
          participants: session.participants,
          gameState: session.gameState,
          availableForGame: session.participants
        });
      }
    }
  });

  // Handle stats request
  socket.on('requestStats', async ({ userId }) => {
    try {
      const stats = await getUserStats(userId);
      if (stats) {
        socket.emit('userStats', stats);
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
