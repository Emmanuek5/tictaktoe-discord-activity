export interface DiscordParticipant {
  username: string;
  discriminator: string;
  id: string;
  bot: boolean;
  flags: number;
  avatar?: string | null;
  global_name?: string | null;
  avatar_decoration_data?: {
    asset: string;
    skuId?: string;
  } | null;
  premium_type?: number | null;
  nickname?: string;
}

export interface ParticipantsResponse {
  participants: DiscordParticipant[];
}
