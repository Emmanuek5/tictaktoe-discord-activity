import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface ArcadeTextProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  size?: "sm" | "md" | "lg";
}

export function ArcadeText({ 
  children, 
  className,
  glowColor = "#ff0080",
  size = "md"
}: ArcadeTextProps) {
  const sizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-4xl"
  };

  return (
    <motion.span
      className={cn(
        "font-arcade",
        sizeClasses[size],
        "tracking-wider",
        "text-white",
        className
      )}
      style={{
        textShadow: `0 0 10px ${glowColor}, 0 0 20px ${glowColor}, 0 0 30px ${glowColor}`,
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.span>
  );
}
