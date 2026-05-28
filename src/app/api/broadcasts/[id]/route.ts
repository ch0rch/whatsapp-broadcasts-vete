import { NextResponse } from 'next/server';
import { kapsoApi } from '@/lib/kapso-api';

export async function GET(
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

    const result = await kapsoApi.broadcasts.get(id);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[broadcasts] GET fetch error', {
      event: 'get_broadcast_error',
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch broadcast' },
      { status: 500 }
    );
  }
}
