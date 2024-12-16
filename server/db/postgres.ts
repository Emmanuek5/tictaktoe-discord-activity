import { Pool } from 'pg';
import { UserStats } from '../types';

const pool = new Pool({
  
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
});

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create user_stats table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        total_games INTEGER DEFAULT 0,
        ai_games_played INTEGER DEFAULT 0,
        ai_wins INTEGER DEFAULT 0
      );
    `);

    // Add updated_at column if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'user_stats' 
          AND column_name = 'updated_at'
        ) THEN 
          ALTER TABLE user_stats 
          ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `);

    // Create game_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_history (
        game_id SERIAL PRIMARY KEY,
        room_id TEXT NOT NULL,
        player_x TEXT NOT NULL,
        player_o TEXT NOT NULL,
        winner TEXT,
        is_draw BOOLEAN DEFAULT FALSE,
        is_ai_game BOOLEAN DEFAULT FALSE,
        moves JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE
      );
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Add function to log game completion
export async function logGameCompletion(gameData: {
  roomId: string;
  playerX: string;
  playerO: string;
  winner?: string;
  isDraw: boolean;
  isAIGame: boolean;
  moves: any[];
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Log the game in history
    const gameResult = await client.query(
      `INSERT INTO game_history (
        room_id, player_x, player_o, winner, is_draw, is_ai_game, moves, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING game_id`,
      [
        gameData.roomId,
        gameData.playerX,
        gameData.playerO,
        gameData.winner || null,
        gameData.isDraw,
        gameData.isAIGame,
        JSON.stringify(gameData.moves)
      ]
    );

    // Update player stats within the same transaction
    if (gameData.isDraw) {
      // Handle draw
      if (gameData.isAIGame) {
        const humanPlayer = gameData.playerX === 'AI' ? gameData.playerO : gameData.playerX;
        await updateUserStatsInTransaction(client, {
          userId: humanPlayer,
          draws: 1,
          aiGamesPlayed: 1,
          totalGames: 1
        });
      } else {
        await updateUserStatsInTransaction(client, {
          userId: gameData.playerX,
          draws: 1,
          totalGames: 1
        });
        await updateUserStatsInTransaction(client, {
          userId: gameData.playerO,
          draws: 1,
          totalGames: 1
        });
      }
    } else if (gameData.winner) {
      // Handle win/loss
      const winnerId = gameData.winner === 'X' ? gameData.playerX : gameData.playerO;
      const loserId = gameData.winner === 'X' ? gameData.playerO : gameData.playerX;

      if (gameData.isAIGame) {
        if (winnerId !== 'AI') {
          await updateUserStatsInTransaction(client, {
            userId: winnerId,
            wins: 1,
            aiGamesPlayed: 1,
            aiWins: 1,
            totalGames: 1
          });
        } else {
          await updateUserStatsInTransaction(client, {
            userId: loserId,
            losses: 1,
            aiGamesPlayed: 1,
            totalGames: 1
          });
        }
      } else {
        await updateUserStatsInTransaction(client, {
          userId: winnerId,
          wins: 1,
          totalGames: 1
        });
        await updateUserStatsInTransaction(client, {
          userId: loserId,
          losses: 1,
          totalGames: 1
        });
      }
    }

    await client.query('COMMIT');
    return gameResult.rows[0].game_id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Helper function to update stats within a transaction
async function updateUserStatsInTransaction(
  client: any,
  stats: Partial<UserStats> & { userId: string }
) {
  await client.query(
    `UPDATE user_stats SET
      wins = COALESCE(wins, 0) + $1,
      losses = COALESCE(losses, 0) + $2,
      draws = COALESCE(draws, 0) + $3,
      total_games = COALESCE(total_games, 0) + $4,
      ai_games_played = COALESCE(ai_games_played, 0) + $5,
      ai_wins = COALESCE(ai_wins, 0) + $6
    WHERE user_id = $7`,
    [
      stats.wins || 0,
      stats.losses || 0,
      stats.draws || 0,
      stats.totalGames || 0,
      stats.aiGamesPlayed || 0,
      stats.aiWins || 0,
      stats.userId
    ]
  );
}

export async function updateUserStats(stats: Partial<UserStats> & { userId: string }) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO user_stats (
        user_id, username, wins, losses, draws, total_games, ai_games_played, ai_wins
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id)
      DO UPDATE SET
        wins = COALESCE(user_stats.wins, 0) + $3,
        losses = COALESCE(user_stats.losses, 0) + $4,
        draws = COALESCE(user_stats.draws, 0) + $5,
        total_games = COALESCE(user_stats.total_games, 0) + $6,
        ai_games_played = COALESCE(user_stats.ai_games_played, 0) + $7,
        ai_wins = COALESCE(user_stats.ai_wins, 0) + $8`,
      [
        stats.userId,
        stats.username || '',
        stats.wins || 0,
        stats.losses || 0,
        stats.draws || 0,
        stats.totalGames || 0,
        stats.aiGamesPlayed || 0,
        stats.aiWins || 0
      ]
    );
  } finally {
    client.release();
  }
}

export async function getUserStats(userId: string): Promise<UserStats | null> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [userId]
    );
    if (!result.rows[0]) return null;
    
    return {
      userId: result.rows[0].user_id,
      username: result.rows[0].username,
      wins: result.rows[0].wins,
      losses: result.rows[0].losses,
      draws: result.rows[0].draws,
      totalGames: result.rows[0].total_games,
      aiGamesPlayed: result.rows[0].ai_games_played,
      aiWins: result.rows[0].ai_wins
    };
  } finally {
    client.release();
  }
}
