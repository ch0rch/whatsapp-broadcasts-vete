'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  Users,
  Filter,
  Megaphone,
  MessageSquare,
  Settings,
  LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/', label: 'Inicio', icon: LayoutDashboard },
  { href: '/contacts', label: 'Contactos', icon: Users },
  { href: '/segments', label: 'Segmentos', icon: Filter },
  { href: '/campaigns', label: 'Campañas', icon: Megaphone },
  { href: '/inbox', label: 'Bandeja de entrada', icon: MessageSquare },
  { href: '/settings', label: 'Configuración', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="flex h-full flex-col w-60 border-r bg-background px-3 py-4">
      <div className="mb-6 px-2">
        <span className="text-lg font-bold">VetPlatform</span>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="pt-4 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Cerrá sesión
        </Button>
      </div>
    </aside>
  )
}
