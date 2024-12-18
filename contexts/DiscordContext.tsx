"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import Logger from "@/utils/logger";

interface Guild {
  id: string;
  name: string;
  icon: string;
  memberCount: number;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
  global_name?: string;
  banner?: string | null;
  banner_color?: string | null;
}

interface DiscordChannel {
  id: string;
  name: string | null;
  type: number;
}

interface DiscordContextType {
  isLoading: boolean;
  error: Error | null;
  auth: { access_token: string } | null;
  currentGuild: Guild | null;
  currentChannel: Channel | null;
  sdk: DiscordSDK | null;
  currentUser: DiscordUser | null;
  clearStoredData: () => Promise<void>;
}

const DiscordContext = createContext<DiscordContextType | null>(null);

export function useDiscordContext() {
  const context = useContext(DiscordContext);
  if (!context) {
    throw new Error("useDiscordContext must be used within a DiscordProvider");
  }
  return context;
}

interface DiscordProviderProps {
  clientId: string;
  children: React.ReactNode;
}

export function DiscordProvider({ clientId, children }: DiscordProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [auth, setAuth] = useState<{ access_token: string } | null>(() => {
    if (typeof window !== "undefined") {
      const savedAuth = localStorage.getItem("discord_auth");
      return savedAuth ? JSON.parse(savedAuth) : null;
    }
    return null;
  });
  const [currentGuild, setCurrentGuild] = useState<Guild | null>(() => {
    if (typeof window !== "undefined") {
      const savedGuild = localStorage.getItem("discord_guild");
      return savedGuild ? JSON.parse(savedGuild) : null;
    }
    return null;
  });
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(() => {
    if (typeof window !== "undefined") {
      const savedChannel = localStorage.getItem("discord_channel");
      return savedChannel ? JSON.parse(savedChannel) : null;
    }
    return null;
  });
  const [currentUser, setCurrentUser] = useState<DiscordUser | null>(() => {
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("discord_user");
      return savedUser ? JSON.parse(savedUser) : null;
    }
    return null;
  });
  const [sdk, setSdk] = useState<DiscordSDK | null>(null);

  // Store auth data in localStorage when it changes
  useEffect(() => {
    if (auth) {
      localStorage.setItem("discord_auth", JSON.stringify(auth));
    } else {
      localStorage.removeItem("discord_auth");
    }
  }, [auth]);

  // Store guild data in localStorage when it changes
  useEffect(() => {
    if (currentGuild) {
      localStorage.setItem("discord_guild", JSON.stringify(currentGuild));
    } else {
      localStorage.removeItem("discord_guild");
    }
  }, [currentGuild]);

  // Store channel data in localStorage when it changes
  useEffect(() => {
    if (currentChannel) {
      localStorage.setItem("discord_channel", JSON.stringify(currentChannel));
    } else {
      localStorage.removeItem("discord_channel");
    }
  }, [currentChannel]);

  // Store user data in localStorage when it changes
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("discord_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("discord_user");
    }
  }, [currentUser]);

  // Initialize SDK
  useEffect(() => {
    const initializeSdk = async () => {
      try {
        const sdkInstance = new DiscordSDK(clientId);
        await sdkInstance.ready();
        Logger.info("Discord SDK initialized");
        setSdk(sdkInstance);

        // If we have stored auth, try to authenticate immediately
        const storedAuth = localStorage.getItem("discord_auth");
        if (storedAuth) {
          const { access_token } = JSON.parse(storedAuth);
          const authResult = await sdkInstance.commands.authenticate({
            access_token,
          });
          if (!authResult) {
            // If stored auth is invalid, clear it
            localStorage.removeItem("discord_auth");
            setAuth(null);
          }
        }
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to initialize SDK");
        Logger.error("Failed to initialize Discord SDK", error);
        setError(error);
      }
    };

    initializeSdk();
  }, [clientId]);

  // Handle Authentication
  useEffect(() => {
    const authenticate = async () => {
      if (!sdk) return;

      try {
        // Only authenticate if we don't have stored auth
        if (!auth) {
          Logger.debug("Starting authentication process");
          const { code } = await sdk.commands.authorize({
            client_id: clientId,
            response_type: "code",
            state: "",
            prompt: "none",
            scope: ["identify", "guilds", "applications.commands"],
          });

          Logger.debug("Exchanging code for token");
          const response = await fetch("/.proxy/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });

          const { access_token } = await response.json();
          const authResult = await sdk.commands.authenticate({ access_token });

          if (!authResult) {
            throw new Error("Authentication failed");
          }

          Logger.info("Authentication successful");
          setAuth(authResult);
        }
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Authentication failed");
        Logger.error("Authentication error", error);
        setError(error);
      }
    };

    if (sdk && !auth) {
      authenticate();
    }
  }, [sdk, clientId, auth]);

  // Fetch Guild Data
  useEffect(() => {
    const fetchGuildData = async () => {
      if (!auth?.access_token || !sdk) return;

      try {
        Logger.debug("Fetching guild data");
        const response = await fetch(
          "https://discord.com/api/v10/users/@me/guilds",
          {
            headers: {
              Authorization: `Bearer ${auth.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const guilds: Guild[] = await response.json();
        console.log("Guilds:", guilds);

        const guild = guilds.find((g) => g.id === sdk.guildId);
        setCurrentGuild(guild || null);
        Logger.info("Guild data fetched", { guildId: guild?.id });
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to fetch guild");
        Logger.error("Failed to fetch guild data", error);
        setError(error);
      }
    };

    fetchGuildData();
  }, [sdk, auth]);

  // Fetch Channel Data
  useEffect(() => {
    const fetchChannelData = async () => {
      if (!sdk?.channelId || !auth) return;

      try {
        Logger.debug("Fetching channel data");
        const discordChannel = (await sdk.commands.getChannel({
          channel_id: sdk.channelId,
        })) as DiscordChannel;

        if (discordChannel) {
          const channel: Channel = {
            id: discordChannel.id,
            name: discordChannel.name || "Unknown Channel",
            type: discordChannel.type,
          };
          setCurrentChannel(channel);
          Logger.info("Channel data fetched", { channelName: channel.name });
        }
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to fetch channel");
        Logger.error("Failed to fetch channel data", error);
        setError(error);
      }
    };

    fetchChannelData();
  }, [sdk, auth]);

  // Fetch User Data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!auth?.access_token || !sdk) return;

      try {
        Logger.debug("Fetching user data");
        const response = await fetch("https://discord.com/api/v10/users/@me", {
          headers: {
            Authorization: `Bearer ${auth.access_token}`,
            "Content-Type": "application/json",
          },
        });

        const user = await response.json();
        setCurrentUser(user);
        Logger.info("User data fetched", { userId: user.id });
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error("Failed to fetch user");
        Logger.error("Failed to fetch user data", error);
        setError(error);
      }
    };

    fetchUserData();
  }, [sdk, auth]);

  // Update loading state
  useEffect(() => {
    setIsLoading(!sdk || !auth);
  }, [sdk, auth]);

  const clearStoredData = useCallback(async () => {
    localStorage.removeItem("discord_auth");
    localStorage.removeItem("discord_guild");
    localStorage.removeItem("discord_channel");
    localStorage.removeItem("discord_user");
    setAuth(null);
    setCurrentGuild(null);
    setCurrentChannel(null);
    setCurrentUser(null);
  }, []);

  const value = {
    isLoading,
    error,
    auth,
    currentGuild,
    currentChannel,
    sdk,
    currentUser,
    clearStoredData,
  };

  return (
    <DiscordContext.Provider value={value}>{children}</DiscordContext.Provider>
  );
}
