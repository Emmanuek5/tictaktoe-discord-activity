import { GameState } from "@/server/types";
import { cn } from "@/lib/utils";

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

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-xl font-bold text-white">{getStatusMessage()}</div>

      <div className="grid grid-cols-3 gap-2 max-w-[300px] w-full">
        {gameState.board.map((cell, index) => (
          <button
            key={index}
            onClick={() => onMove(index)}
            disabled={
              !isPlayerTurn ||
              !!cell ||
              gameState.winner === undefined ||
              gameState.isDraw
            }
            className={cn(
              "aspect-square text-4xl font-bold flex items-center justify-center",
              "transition-all duration-200",
              "bg-game-blue-dark/50 hover:bg-game-blue-dark disabled:hover:bg-game-blue-dark/50",
              "border-2 border-transparent",
              isPlayerTurn &&
                !cell &&
                "border-game-purple/50 hover:border-game-purple",
              cell === "X" && "text-game-purple",
              cell === "O" && "text-game-blue-light"
            )}
          >
            {cell}
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
