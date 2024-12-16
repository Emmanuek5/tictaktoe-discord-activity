import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface UserStats {
  wins: number;
  losses: number;
  draws: number;
  total_games: number;
  ai_games_played: number;
  ai_wins: number;
}

interface UserStatsProps {
  userId: string;
  username: string;
  className?: string;
}

export function UserStats({ userId, username, className }: UserStatsProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`/api/stats?userId=${userId}`);
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    if (userId) {
      fetchStats();
    }
  }, [userId]);

  if (loading) {
    return (
      <Card className={`w-full max-w-md animate-pulse ${className}`}>
        <CardContent className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-8 bg-gray-200 rounded w-full"></div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return null;
  }

  const winRate =
    stats.total_games > 0
      ? ((stats.wins / stats.total_games) * 100).toFixed(1)
      : "0";

  const aiWinRate =
    stats.ai_games_played > 0
      ? ((stats.ai_wins / stats.ai_games_played) * 100).toFixed(1)
      : "0";

  return (
    <Card className="w-[400px] bg-[#1a237e]/80 backdrop-blur-sm text-white border border-blue-400/30">
      <CardContent className="p-6 space-y-4">
        <div>
          <p className="text-sm text-gray-300">Total Games</p>
          <p className="text-2xl font-bold">{stats.total_games}</p>
        </div>

        <div>
          <p className="text-sm text-gray-300">Win Rate</p>
          <p className="text-2xl font-bold">{winRate}%</p>
        </div>

        <div>
          <p className="text-sm text-gray-300">Wins</p>
          <p className="text-2xl font-bold">{stats.wins}</p>
        </div>

        <div>
          <p className="text-sm text-gray-300">Losses</p>
          <p className="text-2xl font-bold">{stats.losses}</p>
        </div>

        <div>
          <p className="text-sm text-gray-300">Draws</p>
          <p className="text-2xl font-bold">{stats.draws}</p>
        </div>

        <div>
          <p className="text-sm text-gray-300">AI Games</p>
          <p className="text-sm text-gray-300">Win Rate: {aiWinRate}%</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default UserStats;
