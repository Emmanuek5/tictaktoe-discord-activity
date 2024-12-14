"use client";
import { useDiscordContext } from "@/contexts/DiscordContext";
import { useEffect, useState } from "react";

export default function Home() {
  const {
    isLoading,
    error,
    auth,
    currentGuild,
    currentChannel,
    sdk,
    currentUser,
  } = useDiscordContext();
  const [pageSize, setPageSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setPageSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
        <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-gray-900"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <div className="mt-10">
        <h1 className="text-3xl font-bold mb-4">Tictakto Discord Activity</h1>
        <p>
          {currentUser?.global_name || currentUser?.username || "Unknown User"}
        </p>
        <p>{currentGuild?.name || "Unknown Guild"}</p>
        <p>{currentChannel?.name || "Unknown Channel"}</p>
        <p>{sdk?.channelId || "Unknown Channel ID"}</p>
        <p>{sdk?.guildId || "Unknown Guild ID"}</p>
        <p>
          {" "}
          {pageSize.width} x {pageSize.height}
        </p>
      </div>
    </div>
  );
}
