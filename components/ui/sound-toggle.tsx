import { Volume2, VolumeX } from "lucide-react";
import { Button } from "./button";
import { soundManager } from "@/utils/sounds";
import { useState } from "react";
import { motion } from "framer-motion";

export function SoundToggle() {
  const [isMuted, setIsMuted] = useState(false);

  const toggleSound = () => {
    if (soundManager) {
      const newMutedState = soundManager.toggleMute();
      setIsMuted(newMutedState);
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSound}
        className="fixed top-4 right-4 bg-purple-900/20 hover:bg-purple-900/40 backdrop-blur-sm"
      >
        {isMuted ? (
          <VolumeX className="h-6 w-6 text-white" />
        ) : (
          <Volume2 className="h-6 w-6 text-white" />
        )}
      </Button>
    </motion.div>
  );
}
