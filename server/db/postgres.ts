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
  } finally {
    client.release();
  }
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
        wins = user_stats.wins + $3,
        losses = user_stats.losses + $4,
        draws = user_stats.draws + $5,
        total_games = user_stats.total_games + $6,
        ai_games_played = user_stats.ai_games_played + $7,
        ai_wins = user_stats.ai_wins + $8`,
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
