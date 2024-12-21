import type { Metadata } from "next";
import { Roboto_Flex } from "next/font/google";
import { Silkscreen } from "next/font/google";
import "./globals.css";
import { DiscordProvider } from "@/contexts/DiscordContext";

const robotoFlex = Roboto_Flex({ subsets: ["latin"] });
const arcadeFont = Silkscreen({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-arcade",
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
  other: {
    httpEquiv: "Content-Security-Policy",
    content:
      "default-src 'self'; connect-src 'self' wss://*.discordsays.com ws://*.discordsays.com https://*.discordsays.com http://*.discordsays.com https://discord.com; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net https://cdn.discordapp.com https://media.discordapp.net; media-src 'self' https://cdn.discordapp.com https://media.discordapp.net; frame-src 'self' https://cdn.discordapp.com https://media.discordapp.net; base-uri 'self'; form-action 'self'; font-src 'self' https://cdn.discordapp.com https://media.discordapp.net; frame-ancestors 'none';",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={arcadeFont.variable}>
      <head>
        <title>Arcade Tic Tac Toe</title>
      </head>
      <body className={`${arcadeFont.className} antialiased`}>
        <DiscordProvider clientId={process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!}>
          {children}
        </DiscordProvider>
      </body>
    </html>
  );
}
