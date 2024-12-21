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
const channelSessions = new Map<string, {
  participants: Map<string, Participant>;
  games: Map<string, GameSession>;
}>();

// Initialize databases
async function init() {
  await Promise.all([initDB(), initRedis()]);
  console.log('Databases initialized');
}

init().catch(console.error);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Helper function to emit session state
  const emitSessionState = async (channelId: string) => {
    try {
      console.log('Emitting session state for channel:', channelId);
      
      const session = channelSessions.get(channelId);
      if (!session) {
        console.log('No session found for channel:', channelId);
        return;
      }

      // Convert participants Map to array
      const participants = Array.from(session.participants.values());
      
      // Get all sockets in the channel
      const roomSockets = await io.in(channelId).fetchSockets();
      console.log('Active sockets in room:', roomSockets.map(s => s.id));

      // Emit to all clients in the channel
      io.to(channelId).emit('sessionState', {
        participants,
        availableForGame: participants.filter(p => 
          !Array.from(session.games.values()).some(game => 
            game.gameState.players.X === p.id || 
            game.gameState.players.O === p.id
          )
        )
      });

      console.log('Session state emitted:', {
        channelId,
        participantCount: participants.length,
        participants: participants.map(p => ({
          id: p.id,
          username: p.username
        }))
      });
    } catch (error) {
      console.error('Error in emitSessionState:', error);
    }
  };

  socket.on("initializeSession", async ({ channelId, userId, username, avatar, global_name, isAIGame }) => {
    try {
      console.log('Initializing session:', { channelId, userId, username, isAIGame });

      // Join the channel room
      await socket.join(channelId);
      
      // Get or create channel session
      let session = channelSessions.get(channelId);
      if (!session) {
        session = {
          participants: new Map(),
          games: new Map()
        };
        channelSessions.set(channelId, session);
      }

      // Add participant to session
      const participant: Participant = {
        id: userId,
        username,
        avatar: avatar || null,
        global_name: global_name || null,
        socketId: socket.id
      };

      session.participants.set(userId, participant);
      console.log('Added participant to session:', participant);

      // Store channel ID in socket for cleanup
      socket.data.channelId = channelId;
      socket.data.userId = userId;

      // If it's an AI game, automatically create a game
      if (isAIGame) {
        const gameId = `game_${Date.now()}`;
        const game: GameSession = {
          gameId,
          gameState: {
            board: Array(9).fill(null),
            currentPlayer: 'X',
            players: {
              X: userId,
              O: 'AI'
            },
            isAIGame: true,
            winner: null,
            isDraw: false,
            winningLine: null,
            roomId: channelId,
            participants: [{
              user: {
                id: userId,
                username
              }
            }]
          },
          playerSockets: {
            X: socket.id,
            O: null
          }
        };
        session.games.set(gameId, game);
        console.log('Created AI game:', gameId);
      }

      // Emit updated session state
      await emitSessionState(channelId);

    } catch (error) {
      console.error('Error in initializeSession:', error);
      socket.emit('error', { message: 'Failed to initialize session' });
    }
  });

  socket.on('disconnect', async () => {
    try {
      const channelId = socket.data.channelId;
      const userId = socket.data.userId;

      if (!channelId || !userId) {
        console.log('No channel/user info for disconnected socket:', socket.id);
        return;
      }

      console.log('Client disconnected:', { socketId: socket.id, channelId, userId });

      const session = channelSessions.get(channelId);
      if (session) {
        // Check if user has other active sockets in the channel
        const roomSockets = await io.in(channelId).fetchSockets();
        const userHasOtherSockets = roomSockets.some(s => 
          s.id !== socket.id && s.data.userId === userId
        );

        if (!userHasOtherSockets) {
          // Remove participant from session
          session.participants.delete(userId);
          console.log('Removed participant from session:', userId);

          // Clean up empty session
          if (session.participants.size === 0) {
            channelSessions.delete(channelId);
            console.log('Removed empty session:', channelId);
          }

          // Emit updated state to remaining participants
          await emitSessionState(channelId);
        }
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });

  socket.on('move', async (move: GameMove & { gameId: string }) => {
    try {
      const channelId = socket.data.channelId;
      const userId = socket.data.userId;

      if (!channelId || !userId) {
        console.log('No channel/user info for move:', socket.id);
        return;
      }

      const session = channelSessions.get(channelId);
      if (!session) return;

      const game = session.games.get(move.gameId);
      if (!game) return;

      // Make player move
      if (game.gameState.board[move.position] === null && 
          game.gameState.currentPlayer === 'X' && 
          game.gameState.players.X === userId) {
        
        game.gameState.board[move.position] = 'X';
        
        // Check for win/draw after player move
        const winner = checkWinner(game.gameState.board);
        const isDraw = !winner && game.gameState.board.every(cell => cell !== null);
        
        if (winner || isDraw) {
          game.gameState.winner = winner;
          game.gameState.isDraw = isDraw;
          game.gameState.currentPlayer = null;
        } else if (game.gameState.isAIGame) {
          // AI's turn
          game.gameState.currentPlayer = 'O';
          
          // Simple AI: find first empty spot
          const aiMove = game.gameState.board.findIndex(cell => cell === null);
          if (aiMove !== -1) {
            setTimeout(() => {
              game.gameState.board[aiMove] = 'O';
              
              // Check for win/draw after AI move
              const winner = checkWinner(game.gameState.board);
              const isDraw = !winner && game.gameState.board.every(cell => cell !== null);
              
              if (winner || isDraw) {
                game.gameState.winner = winner;
                game.gameState.isDraw = isDraw;
                game.gameState.currentPlayer = null;
              } else {
                game.gameState.currentPlayer = 'X';
              }
              
              io.to(channelId).emit('gameState', {
                gameId: move.gameId,
                state: game.gameState
              });
            }, 500); // Add a small delay for AI move
          }
        } else {
          game.gameState.currentPlayer = 'O';
        }
        
        io.to(channelId).emit('gameState', {
          gameId: move.gameId,
          state: game.gameState
        });
      }
    } catch (error) {
      console.error('Error handling move:', error);
    }
  });

  // Helper function to check for a winner
  const checkWinner = (board: Array<string | null>): string | null => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
      [0, 4, 8], [2, 4, 6]             // Diagonals
    ];
    
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  };

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
    const session = channelSessions.get(channelId);
    if (!session) return;

    const inviter = session.participants.get(socket.data.userId);
    if (!inviter) return;

    // Find the invitee's socket ID
    const invitee = session.participants.get(inviteeId);
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
    const session = channelSessions.get(channelId);
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
  for (const [channelId, session] of channelSessions.entries()) {
    // Remove disconnected participants
    session.participants = new Map(Array.from(session.participants.entries()).filter(([id, participant]) => participant.socketId));
    
    // Clean up finished or abandoned games
    for (const [gameId, game] of session.games) {
      const xConnected = game.gameState.players.X ? session.participants.has(game.gameState.players.X) : false;
      const oConnected = game.gameState.players.O ? session.participants.has(game.gameState.players.O) : false;

      if (!xConnected && !oConnected && !game.gameState.isAIGame) {
        session.games.delete(gameId);
      }
    }

    // Remove empty sessions
    if (session.participants.size === 0 && session.games.size === 0) {
      channelSessions.delete(channelId);
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
