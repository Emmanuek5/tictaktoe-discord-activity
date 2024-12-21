import { GameState } from "../server/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { soundManager } from "@/utils/sounds";
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
    gameState.players[
      gameState.currentPlayer as keyof typeof gameState.players
    ] === currentUserId;
  const playerSymbol = gameState.players.X === currentUserId ? "X" : "O";

  const getStatusMessage = () => {
    if (gameState.winner) {
      const isWinner =
        gameState.players[
          gameState.winner as keyof typeof gameState.players
        ] === currentUserId;

      soundManager?.playSound(isWinner ? "win" : "lose");
      return isWinner ? "🎉 You Won!" : "😔 You Lost";
    }
    if (gameState.isDraw) {
      soundManager?.playSound("draw");
      return "🤝 It's a Draw!";
    }
    if (gameState.isAIGame && gameState.currentPlayer === "O")
      return "🤖 AI is thinking...";
    return isPlayerTurn ? "🎮 Your Turn!" : "⏳ Opponent's Turn";
  };

  const handleCellClick = (index: number) => {
    onMove(index);
    soundManager?.playSound("click");
  };

  return (
    <div className="flex flex-col items-center gap-4 md:gap-6 p-4 md:p-0">
      <div className="text-lg md:text-xl font-bold text-white text-center">
        {getStatusMessage()}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4 w-full max-w-[min(90vw,400px)]">
        {gameState.board.map((cell, index) => (
          <button
            key={index}
            onClick={() => handleCellClick(index)}
            disabled={
              cell !== null ||
              gameState.players[
                gameState.currentPlayer as keyof typeof gameState.players
              ] !== currentUserId ||
              gameState.winner !== null ||
              gameState.isDraw
            }
            className={`
              aspect-square flex items-center justify-center
              text-2xl md:text-4xl font-bold rounded-lg
              ${
                cell === null &&
                gameState.players[
                  gameState.currentPlayer as keyof typeof gameState.players
                ] === currentUserId &&
                !gameState.winner &&
                !gameState.isDraw
                  ? "bg-indigo-500/20 hover:bg-indigo-500/30 border-2 border-indigo-500/30"
                  : "bg-[#1a1b26] border-2 border-white/10"
              }
              ${
                gameState.winningLine?.includes(index)
                  ? "bg-green-500/20 border-green-500/30"
                  : ""
              }
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

      <div className="flex flex-wrap gap-2 md:gap-4 text-xs md:text-sm justify-center">
        <div
          className={cn(
            "px-3 md:px-4 py-2 rounded-full",
            playerSymbol === "X" ? "bg-game-purple/20" : "bg-game-blue-light/20"
          )}
        >
          You: {playerSymbol}
        </div>
        <div
          className={cn(
            "px-3 md:px-4 py-2 rounded-full",
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
          className="mt-2 md:mt-4 px-4 md:px-6 py-2 bg-game-purple hover:bg-game-purple/80 text-white rounded-lg 
            transition-colors font-semibold text-sm md:text-base"
        >
          Play Again
        </button>
      )}
    </div>
  );
}
