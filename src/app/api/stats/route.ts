import { NextResponse } from 'next/server'

// Legacy route — disabled. Will be deleted in WU6.
// The original code referenced @/lib/whatsapp which was never implemented in this repo.

export async function GET() {
  return NextResponse.json(
    { error: 'This endpoint has been deprecated. Campaign stats are now in /api/broadcasts.' },
    { status: 410 },
  )
}
