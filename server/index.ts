import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { initDB, updateUserStats, getUserStats, logGameCompletion } from './db/postgres';
import { initRedis, saveGameState, getGameState, deleteGameState } from './db/redis';
import { createNewGame, makeMove } from './game';
import { GameMove, GameState } from './types';
import { getBestMove } from './ai';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const PORT = process.env.PORT || 4000;

// Track active sessions and their participants
const activeSessions = new Map<string, {
  participants: Array<{
    id: string;
    username: string;
    avatar?: string;
    global_name?: string;
  }>;
  gameState: GameState | null;
  lastUpdate: number;
}>();

// Initialize databases
async function init() {
  await Promise.all([initDB(), initRedis()]);
  console.log('Databases initialized');
}

init().catch(console.error);

// Endpoints for game state management
app.post('/api/session/initialize', async (req, res) => {
  const { channelId, userId, username, isAIGame } = req.body;
  
  let session = activeSessions.get(channelId);

  if (session) {
    session.gameState = null;
  } else {
    session = {
      participants: [],
      gameState: null,
      lastUpdate: Date.now()
    };
    activeSessions.set(channelId, session);
  }

  if (!session.participants.find(p => p.id === userId)) {
    session.participants.push({
      id: userId,
      username,
      avatar: req.body.avatar,
      global_name: req.body.global_name
    });
  }

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
    session.lastUpdate = Date.now();
    await saveGameState(gameState);
  }

  try {
    const stats = await getUserStats(userId);
    res.json({
      sessionState: {
        participants: session.participants,
        gameState: session.gameState,
        availableForGame: session.participants.filter(p => p.id !== userId)
      },
      userStats: stats
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/session/poll', (req, res) => {
  const { channelId, lastUpdate } = req.body;
  const session = activeSessions.get(channelId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Only send updates if there are changes since last poll
  if (lastUpdate && session.lastUpdate <= lastUpdate) {
    return res.status(304).end();
  }

  res.json({
    participants: session.participants,
    gameState: session.gameState,
    lastUpdate: session.lastUpdate
  });
});

app.post('/api/game/move', async (req, res) => {
  const { position, player, roomId } = req.body;
  const session = activeSessions.get(roomId);

  if (!session?.gameState) {
    return res.status(400).json({ error: 'Invalid game state' });
  }

  const newGameState = makeMove(session.gameState, { position, player, roomId });
  
  if (newGameState !== session.gameState) {
    session.gameState = newGameState;
    session.lastUpdate = Date.now();
    await saveGameState(newGameState);

    // Handle game over
    if (newGameState.winner || newGameState.isDraw) {
      const { players, isAIGame } = newGameState;
      
      try {
        await logGameCompletion({
          roomId,
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

        // Clean up game state after delay
        setTimeout(async () => {
          if (session.gameState === newGameState) {
            session.gameState = null;
            session.lastUpdate = Date.now();
            await deleteGameState(roomId);
          }
        }, 5000);
      } catch (error) {
        console.error('Error handling game completion:', error);
      }
    }
    
    // Handle AI move
    if (!newGameState.winner && !newGameState.isDraw && 
        newGameState.isAIGame && 
        newGameState.currentPlayer === 'O' && 
        newGameState.players.O === 'AI') {
      setTimeout(async () => {
        const aiMove = getBestMove(newGameState);
        const aiGameState = makeMove(newGameState, {
          position: aiMove,
          player: 'O',
          roomId
        });
        
        if (aiGameState !== newGameState) {
          session.gameState = aiGameState;
          session.lastUpdate = Date.now();
          await saveGameState(aiGameState);
        }
      }, 1000);
    }
  }

  res.json({ gameState: newGameState });
});

app.post('/api/game/reset', async (req, res) => {
  const { channelId, userId, isAIGame } = req.body;
  const session = activeSessions.get(channelId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const gameState = {
    ...createNewGame(channelId),
    isAIGame,
    players: {
      X: userId,
      O: isAIGame ? 'AI' : null
    }
  };

  session.gameState = gameState;
  session.lastUpdate = Date.now();
  await saveGameState(gameState);

  res.json({ gameState });

  // If AI goes first, make the move
  if (isAIGame && gameState.currentPlayer === 'O') {
    setTimeout(async () => {
      const aiMove = getBestMove(gameState);
      const aiGameState = makeMove(gameState, {
        position: aiMove,
        player: 'O',
        roomId: channelId
      });
      
      if (aiGameState !== gameState) {
        session.gameState = aiGameState;
        session.lastUpdate = Date.now();
        await saveGameState(aiGameState);
      }
    }, 1000);
  }
});

app.get('/api/stats/:userId', async (req, res) => {
  try {
    const stats = await getUserStats(req.params.userId);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clean up inactive sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [channelId, session] of activeSessions.entries()) {
    if (now - session.lastUpdate > 30 * 60 * 1000) { // 30 minutes
      activeSessions.delete(channelId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
