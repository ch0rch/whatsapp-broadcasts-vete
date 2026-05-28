'use client'

/**
 * KapsoEmbed — client island
 *
 * Renders the Kapso inbox iframe for a specific conversation.
 * The embed_url is generated server-side (RSC) via POST /platform/v1/inbox_embeds
 * and passed as a prop — never generated client-side.
 *
 * Security:
 * - sandbox="allow-scripts allow-forms allow-same-origin" prevents popups and
 *   top-level navigation while allowing the embed to function.
 * - The embed_url comes from Kapso's platform API and is scoped to one phone_number.
 */

type KapsoEmbedProps = {
  embedUrl: string
  phoneNumber: string
}

export function KapsoEmbed({ embedUrl, phoneNumber }: KapsoEmbedProps) {
  if (!embedUrl) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm p-8">
        No se pudo cargar la conversación. Intentá recargar la página.
      </div>
    )
  }

  return (
    <iframe
      src={embedUrl}
      title={`Conversación con ${phoneNumber}`}
      sandbox="allow-scripts allow-forms allow-same-origin"
      className="w-full h-full border-0 rounded-lg"
      style={{ minHeight: '600px' }}
    />
  )
}
