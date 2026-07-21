import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

export default function Home() {
  redirect('/login')
}