import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";

const loadingVariants = {
  visible: {
    opacity: 1,
    transition: {
      duration: 0.5,
      when: "beforeChildren",
      staggerChildren: 0.2,
    },
  },
  hidden: {
    opacity: 0,
    transition: {
      when: "afterChildren",
    },
  },
};

const itemVariants = {
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      damping: 12,
      stiffness: 200,
    },
  },
  hidden: {
    opacity: 0,
    y: 20,
  },
};

const loadingFacts = [
  "It's Nearly Impossible To Win Against The AI At Tic Tac Toe",
  "The First Known Version Of Tic-Tac-Toe Was Played In Ancient Egypt",
  "There Are 255,168 Possible Unique Games Of Tic-Tac-Toe",
  "The Best First Move In Tic-Tac-Toe Is To Take The Center",
  "Tic-Tac-Toe Is Called 'Noughts And Crosses' In British English",
  "A Perfect Game Of Tic-Tac-Toe Always Ends In A Draw",
  "The Game Has Been Used To Teach Basic Programming Concepts",
  "Some Cultures Play On A 3x3x3 Cube For Added Complexity",
];

export default function Loader() {
  const [currentFact, setCurrentFact] = useState(loadingFacts[0]);
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex((prev) => (prev + 1) % loadingFacts.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCurrentFact(loadingFacts[factIndex]);
  }, [factIndex]);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={loadingVariants}
      className="flex flex-col items-center justify-center w-screen h-screen bg-gradient-to-br from-slate-900 to-slate-800 px-4"
    >
      <motion.div
        variants={itemVariants}
        className="flex flex-col items-center gap-8 max-w-2xl"
      >
        <Image
          src="/loader.gif"
          alt="Discord Says Logo"
          width={100}
          height={100}
          priority
          className="rounded-full shadow-lg shadow-white/10"
        />
        <motion.div
          className="absolute inset-0 rounded-full border-t-2 border-white/20"
          animate={{
            rotate: -360,
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        <div className="space-y-4 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentFact}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{
                type: "spring",
                damping: 20,
                stiffness: 300,
              }}
              className="text-2xl font-bold text-white/90"
            >
              {currentFact}
            </motion.div>
          </AnimatePresence>
          <motion.div
            className="text-white/50 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            Loading your game experience...
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
