import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { 
  initDB, 
  updateUserStats, 
  getUserStats, 
  logGameCompletion, 
  initUserStats 
} from './db/postgres';
import { 
  initRedis, 
  saveGameState, 
  getGameState, 
  deleteGameState,
  saveChannelSession,
  getChannelSession,
  saveChannelParticipants,
  getChannelParticipants,
  addChannelParticipant,
  removeChannelParticipant,
  updateParticipantSocket
} from './db/redis';
import { createNewGame, makeMove } from './game';
import { GameMove, JoinGamePayload, GameState } from './types';
import { getBestMove } from './ai';
import { 
  NextApiResponseServerIO,
  Participant,
  ChannelSession,
  GameSession
} from '../types/socket';

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
  pingInterval: 25000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e6, // 1 MB
  perMessageDeflate: {
    threshold: 1024 // Only compress data above 1KB
  },
  upgradeTimeout: 30000,
  // Performance optimizations
  serveClient: false, // Don't serve client files
  allowEIO3: false, // Only use EIO
});

// Configure worker threads if available
if (process.env.NODE_ENV === 'production') {
  const cluster = require('cluster');
  const numCPUs = require('os').cpus().length;

  if (cluster.isMaster) {
    console.log(`Master ${process.pid} is running`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker: any, code: any, signal: any) => {
      console.log(`Worker ${worker.process.pid} died`);
      // Replace the dead worker
      cluster.fork();
    });
  } else {
    // Workers can share any TCP connection
    httpServer.listen(4000, () => {
      console.log(`Worker ${process.pid} started on port 4000`);
    });
  }
} else {
  httpServer.listen(4000, () => {
    console.log(`Server listening on port 4000`);
  });
}

const PORT = 4000;

// Track active sessions and their participants
const activeSessions = new Map<string, ChannelSession>();

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

  // Helper function to emit session state
  const emitSessionState = async (channelId: string, isAIGame: boolean = false) => {
    try {
      console.log('Emitting session state for channel:', channelId);
      
      const session = activeSessions.get(channelId);
      if (!session) {
        console.log('No session found for channel:', channelId);
        return;
      }

      // Get participants from Redis
      const participants = await getChannelParticipants(channelId);
      console.log('Got participants from Redis:', participants);
      
      // Get all sockets in the channel
      const roomSockets = await io.in(channelId).fetchSockets();
      const socketIds = new Set(roomSockets.map(s => s.id));
      
      console.log('Active sockets in room:', Array.from(socketIds));
      
      // Filter out disconnected participants with more lenient check
      const connectedParticipants = participants.filter(p => {
        // Always include participants that are in the room
        if (p.socketId && socketIds.has(p.socketId)) {
          console.log('Participant in room:', p.username);
          return true;
        }
        
        // If no socketId, check if they have a new socket in the room
        const userSocket = roomSockets.find(s => s.data.userId === p.id);
        if (userSocket) {
          console.log('Participant found with different socket:', p.username);
          p.socketId = userSocket.id;
          return true;
        }

        console.log('Participant not in room:', p.username);
        return false;
      });

      // Update Redis with connected participants
      await saveChannelParticipants(channelId, connectedParticipants);

      // Update memory cache
      session.participants = connectedParticipants;

      // For AI games, only include the current user
      const filteredParticipants = isAIGame 
        ? connectedParticipants.filter(p => p.id === socket.data.userId)
        : connectedParticipants;

      const availableForGame = isAIGame 
        ? []
        : connectedParticipants.filter(p => 
            p.id !== socket.data.userId &&
            !Array.from(session.games.values()).some(game => 
              game.gameState.players.X === p.id || 
              game.gameState.players.O === p.id
            )
          );

      // Add debug logging
      console.log('Final session state:', {
        channelId,
        participantsCount: filteredParticipants.length,
        availableCount: availableForGame.length,
        participants: filteredParticipants.map(p => ({
          id: p.id,
          username: p.username,
          socketId: p.socketId,
          inRoom: socketIds.has(p.socketId || '')
        }))
      });

      // Emit to all clients in the channel
      io.to(channelId).emit('sessionState', {
        participants: filteredParticipants,
        availableForGame
      });
    } catch (error) {
      console.error('Error in emitSessionState:', error);
    }
  };

  socket.on("initializeSession", async ({ channelId, userId, username, avatar, global_name, isAIGame }) => {
    console.log('Initializing session:', { channelId, userId, username, avatar, global_name, isAIGame });
    
    // Store user info in socket data for easy access
    socket.data.userId = userId;
    socket.data.channelId = channelId;
    
    userChannelId = channelId;
    socketToUser.set(socket.id, { userId, channelId });

    // Join the socket to the channel room first
    socket.join(channelId);

    // Get or create session from Redis
    let session = activeSessions.get(channelId);
    if (!session) {
      const savedSession = await getChannelSession(channelId) as ChannelSession | null;
      if (savedSession) {
        session = savedSession;
      } else {
        session = {
          participants: [],
          games: new Map(),
        };
      }
      activeSessions.set(channelId, session);
    }

    // Update participant with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    
    const updateParticipant = async () => {
      try {
        const participant: Participant = {
          id: userId,
          username,
          avatar: avatar || null,
          global_name: global_name || null,
          socketId: socket.id
        };

        // Update Redis and get updated participants list
        const updatedParticipants = await addChannelParticipant(channelId, participant);
        
        if (!session) {
          session = {
            participants: [],
            games: new Map()
          };
          activeSessions.set(channelId, session);
        }
        
        session.participants = updatedParticipants;

        // Save session state to Redis
        await saveChannelSession(channelId, session);
        
        // Emit updated session state
        await emitSessionState(channelId, isAIGame);
        return true;
      } catch (error) {
        console.error('Error updating participant:', error);
        if (retryCount < maxRetries) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          return false;
        }
        return true;
      }
    };

    while (!(await updateParticipant()) && retryCount < maxRetries) {
      console.log(`Retrying participant update (${retryCount + 1}/${maxRetries})`);
    }

    // For AI games, create a new game state
    if (isAIGame) {
      const gameId = `${channelId}-${userId}-AI-${Date.now()}`;
      console.log('Creating new AI game:', gameId);
      
      const gameState = {
        ...createNewGame(channelId),
        isAIGame: true,
        players: {
          X: userId,
          O: 'AI'
        },
        currentPlayer: 'X' // Ensure player goes first
      };

      const gameSession: GameSession = {
        gameId,
        gameState,
        playerSockets: {
          X: socket.id,
          O: null
        }
      };

      session.games.set(gameId, gameSession);
      await saveGameState(gameState);
      
      // Send the initial game state
      socket.emit('gameState', { 
        gameId, 
        state: gameState 
      });
      
      console.log('Sent initial AI game state:', { gameId, state: gameState });
    }

    // Get and send user stats
    try {
      const stats = await getUserStats(userId);
      if (stats) {
        socket.emit('userStats', stats);
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
    }

    // Get user's active games
    const userGames = Array.from(session.games.values())
      .filter(game => 
        (game.gameState.players.X === userId && game.playerSockets.X) || 
        (game.gameState.players.O === userId && game.playerSockets.O)
      );

    // Send each active game to the user
    for (const game of userGames) {
      socket.emit('gameState', { 
        gameId: game.gameId, 
        state: game.gameState 
      });
    }

    // Emit the current session state
    await emitSessionState(channelId, isAIGame);
  });

  socket.on('updateParticipants', ({ channelId, participants, isAIGame }) => {
    const session = activeSessions.get(channelId);
    if (!session) return;

    const userInfo = socketToUser.get(socket.id);
    if (!userInfo) return;

    // Update session participants while preserving socket IDs and existing data
    session.participants = participants.map((newParticipant: any) => {
      const existing = session.participants.find(p => p.id === newParticipant.id);
      return {
        ...existing, // Preserve existing data
        ...newParticipant, // Update with new data
        socketId: existing?.socketId || null, // Preserve socket ID
      };
    });

    // Emit updated session state
    emitSessionState(channelId, isAIGame);
  });

  socket.on('resetGame', async ({ channelId, userId, isAIGame, gameId }) => {
    const session = activeSessions.get(channelId);
    if (!session) return;

    const gameSession = session.games.get(gameId);
    if (!gameSession) return;

    // Create new game state
    const gameState = {
      ...createNewGame(channelId),
      isAIGame,
      players: isAIGame 
        ? {
            X: userId,
            O: 'AI'
          }
        : gameSession.gameState.players
    };

    gameSession.gameState = gameState;
    await saveGameState(gameState);
    socket.emit('gameState', { gameId, state: gameState });

    // If AI goes first, make the move
    if (isAIGame && gameState.currentPlayer === 'O') {
      const aiMove = getBestMove(gameState);
      handleMove({
        position: aiMove,
        player: 'O',
        roomId: channelId,
        gameId
      });
    }
  });

  const handleMove = async (move: GameMove & { gameId: string }) => {
    const session = activeSessions.get(move.roomId);
    if (!session) return;

    const gameSession = session.games.get(move.gameId);
    if (!gameSession) return;

    const newGameState = makeMove(gameSession.gameState, move);
    
    if (newGameState !== gameSession.gameState) {
      gameSession.gameState = newGameState;
      await saveGameState(newGameState);
      io.to(move.roomId).emit('gameState', { gameId: move.gameId, state: newGameState });

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
          if (session.games.get(move.gameId)?.gameState === newGameState) {
            session.games.delete(move.gameId);
            await deleteGameState(move.roomId);
            io.to(move.roomId).emit('gameState', { gameId: move.gameId, state: null });
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
            roomId: move.roomId,
            gameId: move.gameId
          });
        }, 1000);
      }
    }
  };

  socket.on('move', (move: GameMove & { gameId: string }) => {
    const userInfo = socketToUser.get(socket.id);
    if (!userInfo) return;

    const session = activeSessions.get(move.roomId);
    if (!session) return;

    const gameSession = session.games.get(move.gameId);
    if (!gameSession) return;

    // Validate that it's the player's turn
    const { currentPlayer } = gameSession.gameState;
    const playerRole = gameSession.gameState.players.X === userInfo.userId ? 'X' : 'O';
    
    if (currentPlayer !== playerRole) {
      console.log('Not player\'s turn');
      return;
    }

    handleMove(move);
  });

  // Handle disconnections
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    
    const userInfo = socketToUser.get(socket.id);
    if (userInfo && userInfo.channelId) {
      const session = activeSessions.get(userInfo.channelId);
      if (session) {
        try {
          // Update participant's socket ID in Redis
          await updateParticipantSocket(userInfo.channelId, userInfo.userId, null);
          
          // Clean up empty games
          for (const [gameId, game] of session.games) {
            if (game.playerSockets.X === socket.id) {
              game.playerSockets.X = null;
            }
            if (game.playerSockets.O === socket.id) {
              game.playerSockets.O = null;
            }

            // Remove game if both players are disconnected
            if (!game.playerSockets.X && !game.playerSockets.O) {
              session.games.delete(gameId);
            }
          }

          // Remove empty sessions
          if (session.participants.length === 0 && session.games.size === 0) {
            activeSessions.delete(userInfo.channelId);
          }
        } catch (error) {
          console.error('Error handling disconnect:', error);
        }
      }
    }

    // Clean up socket mapping
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
      const gameId = `${channelId}-${Date.now()}`;
      const gameState = {
        ...createNewGame(channelId),
        isAIGame: false,
        players: {
          X: inviterId,
          O: inviteeId
        }
      };

      const gameSession: GameSession = {
        gameId,
        gameState,
        playerSockets: {
          X: null,
          O: null
        }
      };

      session.games.set(gameId, gameSession);
      saveGameState(gameState);
      io.to(channelId).emit('gameState', { gameId, state: gameState });
    }

    // Notify the inviter of the response
    io.to(channelId).emit('inviteResponse', {
      accepted,
      inviterId,
      inviteeId
    });
  });
});

// Clean up inactive sessions periodically
setInterval(() => {
  for (const [channelId, session] of activeSessions.entries()) {
    // Remove disconnected participants
    session.participants = session.participants.filter(p => p.socketId);
    
    // Clean up finished or abandoned games
    for (const [gameId, game] of session.games) {
      const xConnected = session.participants.some(p => 
        p.id === game.gameState.players.X && p.socketId
      );
      const oConnected = session.participants.some(p => 
        p.id === game.gameState.players.O && p.socketId
      );

      if (!xConnected && !oConnected && !game.gameState.isAIGame) {
        session.games.delete(gameId);
      }
    }

    // Remove empty sessions
    if (session.participants.length === 0 && session.games.size === 0) {
      activeSessions.delete(channelId);
    }
  }
}, 300000); // Clean up every 5 minutes

// Handle process termination gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Closing server...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
