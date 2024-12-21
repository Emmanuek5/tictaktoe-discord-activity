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
        variant="outline"
        size="icon"
        onClick={toggleSound}
        className="bg-[#000000] border-2 border-[#33ff33] text-[#33ff33] hover:bg-[#33ff33] hover:text-black transition-all duration-300 w-10 h-10 p-2"
      >
        {isMuted ? (
          <VolumeX className="h-5 w-5" />
        ) : (
          <Volume2 className="h-5 w-5" />
        )}
      </Button>
    </motion.div>
  );
}
