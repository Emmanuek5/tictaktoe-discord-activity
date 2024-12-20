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
  maxHttpBufferSize: 1e6,
  perMessageDeflate: {
    threshold: 1024
  },
  upgradeTimeout: 30000,
  serveClient: false,
  allowEIO3: false,
});

// Track active sessions and their participants
const activeSessions = new Map<string, ChannelSession>();

// Track socket to user ID mappings
const socketToUser = new Map<string, {
  userId: string;
  channelId: string;
}>();

// Helper function to get connected participants in a channel
async function getConnectedParticipants(channelId: string): Promise<Participant[]> {
  try {
    const participants = await getChannelParticipants(channelId);
    return participants.filter(p => {
      if (!p.socketId) return false;
      const socket = io.sockets.sockets.get(p.socketId);
      return socket && socket.connected;
    });
  } catch (error) {
    console.error('Error getting connected participants:', error);
    return [];
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let userChannelId: string | null = null;

  // Helper function to emit session state
  const emitSessionState = async (channelId: string, isAIGame: boolean = false) => {
    try {
      const session = activeSessions.get(channelId);
      if (!session) return;

      const userInfo = socketToUser.get(socket.id);
      if (!userInfo) return;

      // Get connected participants
      const connectedParticipants = await getConnectedParticipants(channelId);

      // Update Redis with connected participants
      await saveChannelParticipants(channelId, connectedParticipants);

      // Update memory cache
      session.participants = connectedParticipants;

      // For AI games, only include the current user
      const filteredParticipants = isAIGame 
        ? connectedParticipants.filter(p => p.id === userInfo.userId)
        : connectedParticipants;

      const availableForGame = isAIGame 
        ? []
        : connectedParticipants.filter(p => 
            p.id !== userInfo.userId &&
            !Array.from(session.games.values()).some(game => 
              game.gameState.players.X === p.id || 
              game.gameState.players.O === p.id
            )
          );

      // Emit to all clients in the channel
      io.to(channelId).emit('sessionState', {
        participants: filteredParticipants,
        availableForGame
      });

      // Log the current state
      console.log(`Channel ${channelId} state:`, {
        totalParticipants: connectedParticipants.length,
        availablePlayers: availableForGame.length,
        activeGames: session.games.size
      });
    } catch (error) {
      console.error('Error in emitSessionState:', error);
    }
  };

  socket.on("initializeSession", async ({ channelId, userId, username, isAIGame }) => {
    console.log('Initializing session:', { channelId, userId, username, isAIGame });
    
    userChannelId = channelId;
    socketToUser.set(socket.id, { userId, channelId });

    // Get or create session
    let session = activeSessions.get(channelId);
    if (!session) {
      const savedSession = await getChannelSession(channelId);
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

    // Initialize user stats
    try {
      await initUserStats(userId, username);
    } catch (error) {
      console.error('Error initializing user stats:', error);
    }

    // Join the socket to the channel room
    socket.join(channelId);

    // Update participant with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    
    const updateParticipant = async () => {
      try {
        const participant: Participant = {
          id: userId,
          username,
          socketId: socket.id,
          avatar: socket.handshake.query.avatar as string,
          global_name: socket.handshake.query.global_name as string
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

    // Get user stats
    try {
      const stats = await getUserStats(userId);
      if (stats) {
        socket.emit('userStats', stats);
      }
    } catch (error) {
      console.error('Error fetching user stats:', error);
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
        currentPlayer: 'X'
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
      
      socket.emit('gameState', { 
        gameId, 
        state: gameState 
      });
    }

    // Emit current session state
    await emitSessionState(channelId, isAIGame);
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
              await deleteGameState(gameId);
            }
          }

          // Save updated session to Redis
          await saveChannelSession(userInfo.channelId, session);
          
          // Emit updated session state
          await emitSessionState(userInfo.channelId);
        } catch (error) {
          console.error('Error handling disconnect:', error);
        }
      }
    }

    // Clean up socket mapping
    socketToUser.delete(socket.id);
  });

  // Handle game moves
  socket.on('move', async (move: GameMove & { gameId: string }) => {
    const userInfo = socketToUser.get(socket.id);
    if (!userInfo) return;

    const session = activeSessions.get(userInfo.channelId);
    if (!session) return;

    const game = session.games.get(move.gameId);
    if (!game) return;

    const { gameState } = game;
    const newState = makeMove(gameState, move);
    
    if (newState) {
      game.gameState = newState;
      await saveGameState(newState);
      
      // Emit updated game state
      io.to(userInfo.channelId).emit('gameState', {
        gameId: move.gameId,
        state: newState
      });

      // For AI games, make AI move
      if (newState.isAIGame && !newState.winner && !newState.isDraw) {
        setTimeout(async () => {
          const aiMove = getBestMove(newState);
          if (aiMove !== null) {
            const aiMoveState = makeMove(newState, { 
              position: aiMove, 
              player: 'O',
              roomId: userInfo.channelId 
            });
            if (aiMoveState) {
              game.gameState = aiMoveState;
              await saveGameState(aiMoveState);
              
              io.to(userInfo.channelId).emit('gameState', {
                gameId: move.gameId,
                state: aiMoveState
              });
            }
          }
        }, 1000);
      }
    }
  });
});

// Initialize databases
async function init() {
  try {
    await Promise.all([initDB(), initRedis()]);
    console.log('Databases initialized');
  } catch (error) {
    console.error('Error initializing databases:', error);
    process.exit(1);
  }
}

init().catch(console.error);

// Start server
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
