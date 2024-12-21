import { motion } from "framer-motion";
import Image from "next/image";

const loadingVariants = {
  visible: {
    opacity: 1,
    transition: {
      duration: 0.5,
    },
  },
  hidden: {
    opacity: 0,
  },
};

const facts = [
  "PERFECT PLAY LEADS TO A DRAW",
  "CENTER IS THE STRONGEST MOVE",
  "CORNERS ARE BETTER THAN EDGES",
  "THE GAME WAS INVENTED IN 1300BC",
];

export default function Loader() {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={loadingVariants}
      className="flex items-center justify-center w-screen h-screen bg-[#000000] relative"
    >
      {/* Scanline effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#33ff33]/10 to-transparent opacity-50 animate-scanline pointer-events-none" />
      
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          {/* Rotating border */}
          <div className="absolute inset-0 border-4 border-t-[#33ff33] border-r-[#33ff33]/50 border-b-[#33ff33]/30 border-l-[#33ff33]/10 rounded-full w-[190px] h-[190px] -left-1 -top-1 animate-spin" />

          {/* Logo */}
          <div className="relative w-[190px] h-[190px] rounded-full overflow-hidden border-4 border-[#33ff33] shadow-[0_0_10px_#33ff33]">
            <Image
              src="/loader.gif"
              alt="Game Logo"
              width={190}
              height={190}
              priority
              unoptimized
              className="rounded-full"
            />
          </div>
        </div>

        <div className="font-arcade text-xl text-[#33ff33] text-center max-w-md px-4 animate-pulse">
          LOADING...
        </div>
        
        <div className="font-arcade text-sm text-[#ffff00] text-center max-w-md px-4">
          {facts[Math.floor(Math.random() * facts.length)]}
        </div>
      </div>
    </motion.div>
  );
}
