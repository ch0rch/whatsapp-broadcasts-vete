/**
 * /api/segments — list + create segments.
 * Auth: Supabase JWT (RLS enforced via createClient).
 */

import { NextResponse } from 'next/server'
import { listSegments, createSegment, validateDefinition } from '@/server/segments/repo'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const segments = await listSegments()
    return NextResponse.json({ data: segments })
  } catch (err) {
    console.error('[segments] GET error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list segments' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, definition } = body as { name: string; definition: unknown }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const validationError = validateDefinition(definition as ReturnType<typeof validateDefinition> extends null ? never : Parameters<typeof validateDefinition>[0])
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Resolve clinic_id from authenticated user
    const supabase = await createClient()
    const { data: membership, error: memErr } = await supabase
      .from('clinic_members')
      .select('clinic_id')
      .single()

    if (memErr || !membership) {
      return NextResponse.json({ error: 'No clinic membership found' }, { status: 403 })
    }

    const segment = await createSegment({
      clinic_id: membership.clinic_id,
      name: name.trim(),
      definition: definition as Parameters<typeof createSegment>[0]['definition'],
    })

    return NextResponse.json({ data: segment }, { status: 201 })
  } catch (err) {
    console.error('[segments] POST error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create segment' },
      { status: 500 },
    )
  }
}
