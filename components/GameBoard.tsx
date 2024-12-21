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
    <div className="flex flex-col items-center gap-4 md:gap-6 p-4 md:p-0">
      <div className="text-lg md:text-xl font-bold text-white text-center font-arcade">
        {getStatusMessage()}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-4 w-full max-w-[min(90vw,400px)] relative">
        {/* Winning line overlay */}
        {gameState.winningLine && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(
              "absolute bg-[#33ff33] h-1 z-10 transform origin-left",
              {
                // Horizontal lines
                "top-[16.67%] w-full": gameState.winningLine[0] === 0,
                "top-[50%] w-full": gameState.winningLine[0] === 3,
                "top-[83.33%] w-full": gameState.winningLine[0] === 6,
                // Vertical lines
                "left-[16.67%] w-1 h-full rotate-90":
                  gameState.winningLine[0] === 0 &&
                  gameState.winningLine[1] === 3,
                "left-[50%] w-1 h-full rotate-90":
                  gameState.winningLine[0] === 1 &&
                  gameState.winningLine[1] === 4,
                "left-[83.33%] w-1 h-full rotate-90":
                  gameState.winningLine[0] === 2 &&
                  gameState.winningLine[1] === 5,
                // Diagonal lines
                "w-[141%] rotate-45 origin-top-left":
                  gameState.winningLine[0] === 0 &&
                  gameState.winningLine[1] === 4,
                "w-[141%] -rotate-45 origin-top-right":
                  gameState.winningLine[0] === 2 &&
                  gameState.winningLine[1] === 4,
              }
            )}
          />
        )}

        {gameState.board.map((cell, index) => (
          <motion.button
            key={index}
            onClick={() => handleCellClick(index)}
            disabled={
              cell !== null ||
              !isPlayerTurn ||
              isGameOver ||
              (gameState.isAIGame && gameState.currentPlayer === "O")
            }
            className={cn(
              "aspect-square bg-[#111111] border-2 text-4xl md:text-6xl font-bold",
              "transition-colors duration-200 flex items-center justify-center",
              "hover:bg-[#222222] disabled:hover:bg-[#111111]",
              {
                "border-[#33ff33]": !cell,
                "border-[#ffff33]": cell === "X",
                "border-[#ff3333]": cell === "O",
                "cursor-not-allowed": !isPlayerTurn || isGameOver,
              }
            )}
            whileHover={
              !cell && isPlayerTurn && !isGameOver ? { scale: 1.05 } : {}
            }
            whileTap={
              !cell && isPlayerTurn && !isGameOver ? { scale: 0.95 } : {}
            }
          >
            {cell && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn({
                  "text-[#ffff33]": cell === "X",
                  "text-[#ff3333]": cell === "O",
                })}
              >
                {cell}
              </motion.span>
            )}
          </motion.button>
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
