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
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.SOCKET_PORT || 4000;

// Track active sessions and their participants
const activeSessions = new Map<string, {
  participants: Array<{
    id: string;
    username: string;
    avatar?: string;
    global_name?: string;
    socketId?: string;
  }>;
  gameState: GameState | null;
}>();

// Track socket to user ID mappings
const socketToUser = new Map<string, {
  userId: string;
  channelId: string;
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
    socketToUser.set(socket.id, { userId, channelId });

    let session = activeSessions.get(channelId);

    // Create new session if it doesn't exist
    if (!session) {
      session = {
        participants: [],
        gameState: null,
      };
      activeSessions.set(channelId, session);
    }

    // Update or add the participant
    const existingParticipant = session.participants.find(p => p.id === userId);
    if (existingParticipant) {
      // Update existing participant's socket ID and other details
      existingParticipant.socketId = socket.id;
      existingParticipant.avatar = socket.handshake.query.avatar as string;
      existingParticipant.global_name = socket.handshake.query.global_name as string;
    } else {
      // Add new participant
      session.participants.push({
        id: userId,
        username,
        socketId: socket.id,
        avatar: socket.handshake.query.avatar as string,
        global_name: socket.handshake.query.global_name as string
      });
    }

    // Join the socket to the channel room
    socket.join(channelId);

    // If there's an existing game state and this user is part of it, restore it
    if (session.gameState) {
      const { players } = session.gameState;
      if (players.X === userId || players.O === userId) {
        socket.emit('gameState', session.gameState);
      }
    }
    // For AI games, create a new game state if none exists
    else if (isAIGame) {
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

    const userInfo = socketToUser.get(socket.id);
    if (!userInfo) return;

    // Update session participants while preserving socket IDs
    const updatedParticipants = participants.map((newParticipant: any) => {
      const existing = session.participants.find(p => p.id === newParticipant.id);
      return {
        ...newParticipant,
        socketId: existing?.socketId,
        avatar: newParticipant.avatar,
        global_name: newParticipant.global_name
      };
    });

    session.participants = updatedParticipants;

    // For AI games, only include the current user in participants
    const filteredParticipants = isAIGame 
      ? session.participants.filter(p => p.id === userInfo.userId)
      : session.participants;

    // Emit updated session state to all clients
    io.to(channelId).emit("sessionState", {
      participants: filteredParticipants,
      gameState: session.gameState,
      availableForGame: isAIGame 
        ? [] 
        : session.participants.filter(p => 
            p.id !== userInfo.userId &&
            p.id !== (session.gameState?.players.X || null) &&
            p.id !== (session.gameState?.players.O || null)
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
          p => p.id !== socketToUser.get(socket.id)?.userId
        );
        
        // If game is in progress and disconnected player was part of it, end the game
        if (session.gameState && 
           (session.gameState.players.X === socketToUser.get(socket.id)?.userId || 
            session.gameState.players.O === socketToUser.get(socket.id)?.userId)) {
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
    socketToUser.delete(socket.id);
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

  // Handle game invites
  socket.on('sendGameInvite', ({ inviteeId, channelId }) => {
    const session = activeSessions.get(channelId);
    if (!session) return;

    const inviter = session.participants.find(p => p.id === socketToUser.get(socket.id)?.userId);
    if (!inviter) return;

    // Find the invitee's socket ID
    const invitee = session.participants.find(p => p.id === inviteeId);
    if (!invitee?.socketId) return;

    const inviteId = `${channelId}-${Date.now()}`;
    
    // Send the invite only to the invitee's socket
    io.to(invitee.socketId).emit('gameInvite', {
      inviter,
      inviteId,
      inviteeId
    });
  });

  socket.on('respondToInvite', ({ inviteId, accepted, inviterId, inviteeId, channelId }) => {
    const session = activeSessions.get(channelId);
    if (!session) return;

    if (accepted) {
      // Create new game state
      const gameState = {
        ...createNewGame(channelId),
        isAIGame: false,
        players: {
          X: inviterId,
          O: inviteeId
        }
      };

      session.gameState = gameState;
      saveGameState(gameState);
      io.to(channelId).emit('gameState', gameState);
    }

    // Notify the inviter of the response
    io.to(channelId).emit('inviteResponse', {
      accepted,
      inviterId,
      inviteeId
    });
  });
});

httpServer.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});
