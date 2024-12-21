export interface GameState {
  board: Array<string | null>;
  currentPlayer: string | null;
  players: {
    X: string | null;
    O: string | null;
  };
  winner: string | null;
  winningLine: number[] | null;
  isDraw: boolean;
  roomId: string;
  isAIGame: boolean;
  participants: Array<{
    user: {
      id: string;
      username: string;
    };
  }>;
}

export interface UserStats {
  userId: string;
  username: string;
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  aiGamesPlayed: number;
  aiWins: number;
}

export interface GameMove {
  position: number;
  player: string;
  roomId: string;
}

export interface JoinGamePayload {
  roomId: string;
  userId: string;
  username: string;
  participants: Array<{
    user: {
      id: string;
      username: string;
    };
  }>;
  isAIGame?: boolean;
}
