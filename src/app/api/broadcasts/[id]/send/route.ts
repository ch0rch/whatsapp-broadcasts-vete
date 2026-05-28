import { NextResponse } from 'next/server';
import { kapsoApi } from '@/lib/kapso-api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Broadcast ID is required' },
        { status: 400 }
      );
    }

    const result = await kapsoApi.broadcasts.send(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[broadcasts] POST send error', {
      event: 'send_broadcast_error',
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send broadcast' },
      { status: 500 }
    );
  }
}
