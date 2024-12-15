import { createClient } from 'redis';
import { GameState } from '../types';

const redisClient = createClient({
  url: process.env.REDIS_URL
});

redisClient.on('connect', () => console.log('Redis Client Connected'));
redisClient.on('error', (err) => console.log('Redis Client Error', err));

export async function initRedis() {
  await redisClient.connect();
}

export async function saveGameState(gameState: GameState) {
  await redisClient.set(
    `game:${gameState.roomId}`,
    JSON.stringify(gameState),
    { EX: 3600 } // Expire after 1 hour
  );
}

export async function getGameState(roomId: string): Promise<GameState | null> {
  const state = await redisClient.get(`game:${roomId}`);
  return state ? JSON.parse(state) : null;
}

export async function deleteGameState(roomId: string) {
  await redisClient.del(`game:${roomId}`);
}
