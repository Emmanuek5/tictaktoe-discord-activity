import { Pool } from 'pg';
import { UserStats } from '../types';

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
  maxUses: 7500, // Close and replace a connection after it has been used 7500 times
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Handle pool connection issues
pool.on('connect', (client) => {
  console.log('New client connected to the pool');
});

pool.on('remove', (client) => {
  console.log('Client removed from pool');
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
        ai_wins INTEGER DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    console.log('Database initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function initUserStats(userId: string, username: string) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO user_stats (user_id, username)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET username = EXCLUDED.username,
           updated_at = CURRENT_TIMESTAMP`,
      [userId, username]
    );
  } catch (error) {
    console.error('Error initializing user stats:', error);
    throw error;
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
  } catch (error) {
    console.error('Error getting user stats:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateUserStats(
  userId: string,
  update: Partial<UserStats>
) {
  const client = await pool.connect();
  try {
    const setClause = Object.entries(update)
      .filter(([key]) => key !== 'user_id' && key !== 'username')
      .map(([key], index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = [userId, ...Object.entries(update)
      .filter(([key]) => key !== 'user_id' && key !== 'username')
      .map(([_, value]) => value)];

    await client.query(
      `UPDATE user_stats 
       SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = $1`,
      values
    );
  } catch (error) {
    console.error('Error updating user stats:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function logGameCompletion({
  roomId,
  playerX,
  playerO,
  winner,
  isDraw,
  isAIGame,
  moves
}: {
  roomId: string;
  playerX: string;
  playerO: string;
  winner?: string;
  isDraw?: boolean;
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
        roomId,
        playerX,
        playerO,
        winner || null,
        isDraw,
        isAIGame,
        JSON.stringify(moves)
      ]
    );

    // Update player stats within the same transaction
    if (isDraw) {
      // Handle draw
      if (isAIGame) {
        const humanPlayer = playerX === 'AI' ? playerO : playerX;
        await updateUserStatsInTransaction(client, {
          userId: humanPlayer,
          draws: 1,
          aiGamesPlayed: 1,
          totalGames: 1
        });
      } else {
        await updateUserStatsInTransaction(client, {
          userId: playerX,
          draws: 1,
          totalGames: 1
        });
        await updateUserStatsInTransaction(client, {
          userId: playerO,
          draws: 1,
          totalGames: 1
        });
      }
    } else if (winner) {
      // Handle win/loss
      const winnerId = winner === 'X' ? playerX : playerO;
      const loserId = winner === 'X' ? playerO : playerX;

      if (isAIGame) {
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
    console.error('Error logging game completion:', error);
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  try {
    await pool.end();
    console.log('Database pool has ended');
  } catch (error) {
    console.error('Error during database pool shutdown:', error);
  }
});

process.on('SIGINT', async () => {
  try {
    await pool.end();
    console.log('Database pool has ended');
  } catch (error) {
    console.error('Error during database pool shutdown:', error);
  }
});
