/**
 * /api/segments/preview — preview how many customers match a segment definition
 * WITHOUT persisting the segment.
 *
 * POST body: { definition: SegmentDefinition }
 * Response:  { count: number }
 *
 * Auth: Supabase JWT (RLS via createClient).
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { previewSegment } from '@/server/segments/builder'
import { validateDefinition } from '@/server/segments/repo'
import type { SegmentDefinition } from '@/server/segments/types'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { definition } = body as { definition: SegmentDefinition }

    const validationError = validateDefinition(definition)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: membership, error: memErr } = await supabase
      .from('clinic_members')
      .select('clinic_id')
      .single()

    if (memErr || !membership) {
      return NextResponse.json({ error: 'No clinic membership found' }, { status: 403 })
    }

    const { count, error } = await previewSegment(supabase, membership.clinic_id, definition)
    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ count })
  } catch (err) {
    console.error('[segments/preview] POST error', {
      event: 'preview_segment_error',
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Preview failed' },
      { status: 500 },
    )
  }
}
