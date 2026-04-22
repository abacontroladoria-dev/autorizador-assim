import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
  const supabase = await createClient(cookies())

  const { data, error } = await supabase
    .from('sync_status')
    .select('status')
    .eq('id', 1)
    .single()

  if (error) {
    return Response.json({ status: 'error' })
  }

  return Response.json({ status: data?.status })
}