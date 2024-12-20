import { createClient } from 'redis';
import { GameState } from '../types';
import { Participant, ChannelSession } from '../../types/socket';

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

// New functions for channel-based session management
export async function saveChannelSession(channelId: string, session: ChannelSession) {
  // Convert Map to array for JSON serialization
  const serializedSession = {
    ...session,
    games: Array.from(session.games.entries())
  };
  
  await redisClient.set(
    `channel:${channelId}:session`,
    JSON.stringify(serializedSession),
    { EX: 86400 } // Expire after 24 hours
  );
}

export async function getChannelSession(channelId: string): Promise<ChannelSession | null> {
  const session = await redisClient.get(`channel:${channelId}:session`);
  if (!session) return null;
  
  const parsedSession = JSON.parse(session);
  // Convert array back to Map
  return {
    ...parsedSession,
    games: new Map(parsedSession.games)
  };
}

export async function saveChannelParticipants(channelId: string, participants: Participant[]) {
  await redisClient.set(
    `channel:${channelId}:participants`,
    JSON.stringify(participants),
    { EX: 86400 } // Expire after 24 hours
  );
}

export async function getChannelParticipants(channelId: string): Promise<Participant[]> {
  const participants = await redisClient.get(`channel:${channelId}:participants`);
  return participants ? JSON.parse(participants) : [];
}

export async function addChannelParticipant(channelId: string, participant: Participant): Promise<Participant[]> {
  const participants = await getChannelParticipants(channelId);
  const existingIndex = participants.findIndex((p: Participant) => p.id === participant.id);
  
  if (existingIndex !== -1) {
    participants[existingIndex] = { ...participants[existingIndex], ...participant };
  } else {
    participants.push(participant);
  }
  
  await saveChannelParticipants(channelId, participants);
  return participants;
}

export async function removeChannelParticipant(channelId: string, participantId: string): Promise<Participant[]> {
  const participants = await getChannelParticipants(channelId);
  const updatedParticipants = participants.filter((p: Participant) => p.id !== participantId);
  await saveChannelParticipants(channelId, updatedParticipants);
  return updatedParticipants;
}

export async function updateParticipantSocket(channelId: string, participantId: string, socketId: string | null): Promise<Participant[]> {
  const participants = await getChannelParticipants(channelId);
  const participant = participants.find((p: Participant) => p.id === participantId);
  
  if (participant) {
    participant.socketId = socketId;
    await saveChannelParticipants(channelId, participants);
  }
  
  return participants;
}
