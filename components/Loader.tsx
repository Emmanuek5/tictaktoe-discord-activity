import { cn } from "@/lib/utils";

const fact = "It's Nearly Impossible To Win Against The AI At Tic Tac Toe";

export default function Loader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center w-screen h-screen bg-gradient-to-br from-slate-900 to-slate-800",
        className
      )}
    >
      <div className="flex flex-col items-center justify-center space-y-4">
        <div
          className={cn(
            "font-arcade text-2xl text-white relative",
            "after:content-['LOADING'] after:absolute after:left-[2px] after:top-[2px] after:text-purple-500/50",
            "before:content-['LOADING'] before:absolute before:left-[-2px] before:top-[-2px] before:text-pink-500/50"
          )}
        >
          LOADING
        </div>
        <div className="flex space-x-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="w-3 h-3 bg-white animate-[blink_1s_ease-in-out_infinite] delay-75"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </div>
        <div className="text-2xl font-bold text-white/90 text-center max-w-md px-4">
          {fact}
        </div>
      </div>
    </div>
  );
}
