import { NextResponse } from 'next/server';
import { GAME_SERVER } from '@/app/config';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const response = await fetch(`${GAME_SERVER}/api/game/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Game server responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error making move:', error);
    return NextResponse.json(
      { error: 'Failed to make move' },
      { status: 500 }
    );
  }
}
