import { NextResponse } from 'next/server';
import { getUserStats } from '@/server/db/postgres';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
  }

  try {
    const stats = await getUserStats(userId);
    return NextResponse.json(stats || { 
      wins: 0, 
      losses: 0, 
      draws: 0, 
      total_games: 0, 
      ai_games_played: 0, 
      ai_wins: 0 
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    return NextResponse.json({ error: 'Failed to fetch user stats' }, { status: 500 });
  }
}
