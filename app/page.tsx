"use client";

import { useDiscordContext } from "@/contexts/DiscordContext";
import { useEffect, useState } from "react";
import { ParticipantsResponse } from "@/types/discord";
import Image from "next/image";

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
  const [participants, setParticipants] = useState<ParticipantsResponse | null>(
    null
  );

  useEffect(() => {
    const handleResize = () => {
      const width = Math.min(Math.max(window.innerWidth, 1536), 1536);
      const height = Math.min(Math.max(window.innerHeight, 720), 720);
      setPageSize({
        width,
        height,
      });
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const getParticipants = async () => {
      if (!sdk?.channelId || !auth) return;

      const participants =
        await sdk.commands.getInstanceConnectedParticipants();

      setParticipants(participants);
    };

    sdk?.subscribe(
      "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE",
      (e: ParticipantsResponse) => {
        setParticipants(e);
      }
    );

    getParticipants();
  }, [sdk, auth]);

  if (isLoading || !pageSize.width || !pageSize.height) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-gradient-to-br from-indigo-900 to-black">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white animate-pulse">
            Loading
          </h1>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <main
      className="bg-gradient-to-br from-indigo-900 to-black text-white overflow-hidden flex flex-col"
      style={{
        width: `${pageSize.width}px`,
        height: `${pageSize.height}px`,
        overflow: "hidden",
      }}
    >
      <div className="flex flex-col h-full p-4">
        {/* Title */}
        <h1 className="text-3xl font-extrabold text-center mb-4 text-white">
          Tictactoe Showdown
        </h1>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Left Box - User Data */}
          <div className="w-1/5 min-w-[200px] bg-indigo-800/50 rounded-xl p-4 shadow-lg backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white mb-4 border-b border-purple-300/30 pb-2">
              Player Profile
            </h2>
            <div className="space-y-4 text-gray-200">
              <div className="flex flex-col items-center">
                <Image
                  src={
                    currentUser?.avatar
                      ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
                      : "https://cdn.discordapp.com/embed/avatars/0.png"
                  }
                  width={160}
                  height={160}
                  alt={"User Avatar"}
                  className="w-40 h-40 rounded-full object-cover border-4 border-purple-500/50"
                />
                <div className="mt-4 text-center">
                  <p className="text-lg font-bold">
                    {currentUser?.global_name || currentUser?.username}
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <p className="flex justify-between">
                  <span className="opacity-70">Guild:</span>
                  <span className="font-medium">{currentGuild?.name}</span>
                </p>
                <p className="flex justify-between">
                  <span className="opacity-70">Channel:</span>
                  <span className="font-medium">{currentChannel?.name}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Center - Game Controls */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-6">
            <button className="px-8 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg hover:shadow-purple-500/50">
              Play Against AI
            </button>
            <button className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg hover:shadow-blue-500/50">
              Multiplayer Game
            </button>
          </div>

          {/* Right Box - Participants */}
          <div className="w-1/5 min-w-[200px] bg-purple-800/50 rounded-xl p-4 shadow-lg backdrop-blur-sm">
            <h2 className="text-xl font-semibold text-white mb-4 border-b border-purple-300/30 pb-2">
              Participants
            </h2>
            <div className="space-y-3 flex-1 overflow-y-auto pr-2">
              {participants?.participants.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center space-x-3 bg-purple-700/30 rounded-lg p-2 hover:bg-purple-700/50 transition-colors"
                >
                  <Image
                    src={
                      participant.avatar
                        ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png`
                        : "https://cdn.discordapp.com/embed/avatars/0.png"
                    }
                    width={40}
                    height={40}
                    alt={"User Avatar"}
                    className="rounded-full object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {participant.global_name || participant.username}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
