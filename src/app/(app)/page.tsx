import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Dashboard — RSC.
 * Shows clinic summary and monthly cap usage.
 * Real data queried from Supabase; falls back to skeletons on error.
 */
export const metadata = {
  title: 'Inicio — VetPlatform',
}

async function getClinicData() {
  const supabase = await createClient()

  // Get the clinic for the logged-in user
  const { data: membership } = await supabase
    .from('clinic_members')
    .select('clinic_id')
    .single()

  if (!membership) return null

  const { data: clinic } = await supabase
    .from('clinics')
    .select(
      'id, name, plan, monthly_message_limit, messages_used_this_month, usage_period_start',
    )
    .eq('id', membership.clinic_id)
    .single()

  return clinic
}

export default async function DashboardPage() {
  const clinic = await getClinicData()

  const usedMessages = clinic?.messages_used_this_month ?? 0
  const limitMessages = clinic?.monthly_message_limit ?? 2000
  const usagePercent = Math.min(
    Math.round((usedMessages / limitMessages) * 100),
    100,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {clinic?.name ?? 'Tu clínica'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Panel de control
        </p>
      </div>

      {/* Monthly cap card */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mensajes este mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {clinic ? (
              <>
                <div className="text-2xl font-bold">
                  {usedMessages.toLocaleString('es-AR')}{' '}
                  <span className="text-base font-normal text-muted-foreground">
                    / {limitMessages.toLocaleString('es-AR')}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usagePercent >= 90
                        ? 'bg-destructive'
                        : usagePercent >= 70
                          ? 'bg-yellow-500'
                          : 'bg-primary'
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {usagePercent}% del plan{' '}
                  {clinic.plan === 'free' ? 'Kapso Free' : 'Kapso Pro'} usado
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Accesos rápidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/contacts" className="text-primary hover:underline">
                  Ver contactos
                </Link>
              </li>
              <li>
                <Link href="/campaigns" className="text-primary hover:underline">
                  Ver campañas
                </Link>
              </li>
              <li>
                <Link href="/inbox" className="text-primary hover:underline">
                  Bandeja de entrada
                </Link>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
