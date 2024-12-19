import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

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

const fact = "It's Nearly Impossible To Win Against The AI At Tic Tac Toe";

export default function Loader() {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={loadingVariants}
      className="flex items-center justify-center w-screen h-screen bg-gradient-to-br from-slate-900 to-slate-800"
    >
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          {/* Rotating circle */}
          <div className="absolute inset-0 border-4 border-t-pink-500 border-transparent rounded-full w-[190px] h-[190px] -left-1 -top-1 animate-spin" />

          {/* Logo */}
          <Image
            src="/loader.gif"
            alt="Discord Says Logo"
            width={190}
            height={190}
            priority
            unoptimized
            className="rounded-full shadow-lg shadow-white/10 z-10"
          />
        </div>

        <div className="text-2xl font-bold text-white/90 text-center max-w-md px-4">
          {fact}
        </div>
      </div>
    </motion.div>
  );
}
