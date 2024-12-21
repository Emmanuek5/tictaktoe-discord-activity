import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { initDB, updateUserStats, getUserStats, logGameCompletion, initUserStats } from './db/postgres';
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

interface GameSession {
  gameId: string;
  gameState: GameState;
  playerSockets: {
    X: string | null;
    O: string | null;
  };
}

// Track active sessions and their participants
const activeSessions = new Map<string, {
  participants: Array<{
    id: string;
    username: string;
    avatar?: string;
    global_name?: string;
    socketId?: string | null;
  }>;
  games: Map<string, GameSession>;
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
    console.log('Initializing session:', { channelId, userId, username, isAIGame });
    
    userChannelId = channelId;
    socketToUser.set(socket.id, { userId, channelId });

    // Get or create session
    let session = activeSessions.get(channelId);
    if (!session) {
      console.log('Creating new session for channel:', channelId);
      session = {
        participants: [],
        games: new Map(),
      };
      activeSessions.set(channelId, session);
    } else {
      console.log('Using existing session for channel:', channelId);
    }

    // Initialize user stats in the database
    try {
      await initUserStats(userId, username);
    } catch (error) {
      console.error('Error initializing user stats:', error);
    }

    // Update or add the participant
    const participantIndex = session.participants.findIndex(p => p.id === userId);
    if (participantIndex !== -1) {
      // Update existing participant's socket ID
      console.log('Updating existing participant socket:', userId);
      session.participants[participantIndex] = {
        ...session.participants[participantIndex],
        socketId: socket.id,
        avatar: socket.handshake.query.avatar as string,
        global_name: socket.handshake.query.global_name as string
      };
    } else {
      // Add new participant
      console.log('Adding new participant:', userId);
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

    // Emit updated session state to all clients in the channel
    const sessionState = {
      participantCount: session.participants.length,
      activeGames: session.games.size,
      availablePlayerCount: session.participants.filter(p => 
        !Array.from(session.games.values()).some(game => 
          game.gameState.players.X === p.id || game.gameState.players.O === p.id
        )
      ).length
    };
    
    io.to(channelId).emit('sessionState', sessionState);
    console.log('Emitting session state:', sessionState);

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
      availableForGame: isAIGame 
        ? [] 
        : session.participants.filter(p => 
            p.socketId && // Only include connected players
            p.id !== userInfo.userId &&
            p.id !== (session.games.get(userInfo.userId)?.gameState.players.X || null) &&
            p.id !== (session.games.get(userInfo.userId)?.gameState.players.O || null)
          )
    });
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

  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);
    const userInfo = socketToUser.get(socket.id);
    
    if (userInfo) {
      const { channelId, userId } = userInfo;
      const session = activeSessions.get(channelId);
      
      if (session) {
        // Update participant's socket ID to null but keep them in the session
        const participant = session.participants.find(p => p.id === userId);
        if (participant) {
          participant.socketId = null;
        }

        // Only end the game if all players have disconnected
        const userGames = Array.from(session.games.values())
          .filter(game => 
            game.gameState.players.X === userId || 
            game.gameState.players.O === userId
          );

        for (const game of userGames) {
          const xPlayerConnected = session.participants.some(p => 
            p.id === game.gameState.players.X && p.socketId
          );
          const oPlayerConnected = session.participants.some(p => 
            p.id === game.gameState.players.O && p.socketId
          );

          if (!xPlayerConnected && !oPlayerConnected && !game.gameState.isAIGame) {
            // Log the incomplete game
            try {
              await logGameCompletion({
                roomId: channelId,
                playerX: game.gameState.players.X || 'unknown',
                playerO: game.gameState.players.O || 'unknown',
                isDraw: true, // Mark as draw for incomplete games
                isAIGame: game.gameState.isAIGame,
                moves: game.gameState.board.map((value, index) => ({
                  position: index,
                  player: value
                })).filter(move => move.player !== null)
              });

              // Clean up the game state
              session.games.delete(game.gameId);
              await deleteGameState(channelId);
            } catch (error) {
              console.error('Error handling game cleanup:', error);
            }
          }
        }

        // Remove empty sessions
        if (session.participants.every(p => !p.socketId)) {
          activeSessions.delete(channelId);
        } else {
          // Notify remaining participants
          io.to(channelId).emit('sessionState', {
            participants: session.participants,
            availableForGame: session.participants.filter(p => 
              p.socketId && // Only include connected players
              p.id !== (session.games.get(userInfo.userId)?.gameState.players.X || null) &&
              p.id !== (session.games.get(userInfo.userId)?.gameState.players.O || null)
            )
          });
        }
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
    for (const [gameId, game] of session.games.entries()) {
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
