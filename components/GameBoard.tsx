import { GameState } from "../server/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface GameBoardProps {
  gameState: GameState;
  currentUserId: string;
  onMove: (position: number) => void;
  onReset?: () => void;
}

export function GameBoard({
  gameState,
  currentUserId,
  onMove,
  onReset,
}: GameBoardProps) {
  const isGameOver = !!gameState.winner || gameState.isDraw;
  const isPlayerTurn =
    gameState.currentPlayer ===
    (gameState.players.X === currentUserId ? "X" : "O");
  const playerSymbol = gameState.players.X === currentUserId ? "X" : "O";

  const getStatusMessage = () => {
    if (gameState.winner) {
      const isWinner =
        gameState.players[
          gameState.winner as keyof typeof gameState.players
        ] === currentUserId;
      return isWinner ? "🎉 You Won!" : "😔 You Lost";
    }
    if (gameState.isDraw) return "🤝 It's a Draw!";
    if (gameState.isAIGame && gameState.currentPlayer === "O")
      return "🤖 AI is thinking...";
    return isPlayerTurn ? "🎮 Your Turn!" : "⏳ Opponent's Turn";
  };

  const handleCellClick = (index: number) => {
    onMove(index);
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-xl font-bold text-white">{getStatusMessage()}</div>

      <div className="grid grid-cols-3 gap-4">
        {gameState.board.map((cell, index) => (
          <button
            key={index}
            onClick={() => handleCellClick(index)}
            disabled={
              cell !== null ||
              gameState.currentPlayer !== currentUserId ||
              gameState.winner !== null ||
              gameState.isDraw
            }
            className={`
              aspect-square flex items-center justify-center
              text-4xl font-bold rounded-lg
              ${
                cell === null &&
                gameState.currentPlayer === currentUserId &&
                !gameState.winner &&
                !gameState.isDraw
                  ? "bg-indigo-500/20 hover:bg-indigo-500/30 border-2 border-indigo-500/30"
                  : "bg-[#1a1b26] border-2 border-white/10"
              }
              ${gameState.winningLine?.includes(index) ? "bg-green-500/20 border-green-500/30" : ""}
              transition-all duration-200
            `}
          >
            {cell === "X" ? (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-indigo-400"
              >
                X
              </motion.span>
            ) : cell === "O" ? (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="text-violet-400"
              >
                O
              </motion.span>
            ) : (
              <span className="text-transparent">·</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-4 text-sm">
        <div
          className={cn(
            "px-4 py-2 rounded-full",
            playerSymbol === "X" ? "bg-game-purple/20" : "bg-game-blue-light/20"
          )}
        >
          You: {playerSymbol}
        </div>
        <div
          className={cn(
            "px-4 py-2 rounded-full",
            gameState.currentPlayer === "X"
              ? "bg-game-purple/20"
              : "bg-game-blue-light/20"
          )}
        >
          Current Turn: {gameState.currentPlayer}
        </div>
      </div>

      {isGameOver && (
        <button
          onClick={onReset}
          className="mt-4 px-6 py-2 bg-game-purple hover:bg-game-purple/80 text-white rounded-lg 
            transition-colors font-semibold"
        >
          Play Again
        </button>
      )}
    </div>
  );
}
