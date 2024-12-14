// lib/redis.ts
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL!, // Use an environment variable for the Redis connection URL
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to Redis
(async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
})();

export default redisClient;
