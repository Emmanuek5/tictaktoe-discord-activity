import { GameState } from "@/server/types"
import { Server as NetServer } from "http"
import { NextApiResponse } from "next"
import { Server as ServerIO } from "socket.io"

export type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: NetServer & {
      io: ServerIO
    }
  }
}

export interface Participant {
  id: string;
  username: string;
  avatar?: string;
  global_name?: string;
  socketId?: string | null;
}

export interface ChannelSession {
  participants: Participant[];
  games: Map<string, GameSession>;
}

export interface GameSession {
  gameId: string;
  gameState: GameState;
  playerSockets: {
    X: string | null;
    O: string | null;
  };
}
