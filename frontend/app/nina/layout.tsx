import { redirect } from 'next/navigation'

export default function NinaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  redirect('/connect/inbox')
}
