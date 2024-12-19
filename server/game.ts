import { GameState, GameMove } from './types';

export function createNewGame(roomId: string): GameState {
  return {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    players: {
      X: null,
      O: null
    },
    winner: null,
    winningLine: null,
    isDraw: false,
    roomId,
    isAIGame: false,
    participants: []
  };
}

export function checkWinner(board: Array<string | null>): { winner: string | null; winningLine: number[] | null } {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (const line of lines) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], winningLine: line };
    }
  }

  return { winner: null, winningLine: null };
}

export function checkDraw(board: Array<string | null>): boolean {
  return board.every(cell => cell !== null);
}

export function makeMove(gameState: GameState, move: GameMove): GameState {
  if (
    gameState.winner ||
    gameState.isDraw ||
    gameState.board[move.position] !== null ||
    gameState.currentPlayer !== move.player ||
    !gameState.players[move.player as keyof typeof gameState.players]
  ) {
    return gameState;
  }

  const newBoard = [...gameState.board];
  newBoard[move.position] = move.player;

  const { winner, winningLine } = checkWinner(newBoard);
  const isDraw = !winner && checkDraw(newBoard);

  return {
    ...gameState,
    board: newBoard,
    currentPlayer: move.player === 'X' ? 'O' : 'X',
    winner,
    winningLine,
    isDraw
  };
}
