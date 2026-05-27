import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export const metadata = {
  title: 'Iniciar sesión — VetPlatform',
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm mx-auto px-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">VetPlatform</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Iniciá sesión para continuar
        </p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
