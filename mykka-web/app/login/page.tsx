import { redirect } from 'next/navigation'
import { APP_URL } from '@/lib/config'

// /login is a natural guess for where to sign in on the marketing site —
// without this route it 404s, same dead-end the console's /sign-in had
// before its own fix. Redirect to the real app instead.
export default function LoginPage() {
  redirect(APP_URL)
}
