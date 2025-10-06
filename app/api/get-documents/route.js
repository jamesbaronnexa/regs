// /app/api/get-documents/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // Bypasses RLS
)

export async function GET() {
  // For testing: get all verified documents
  // Later: get only user's documents based on auth
  const { data, error } = await supabase
    .from('documents')
    .select('id, filename, title, uploaded_at, pdf_page_offset')
    .eq('is_verified', true)
    .order('uploaded_at', { ascending: false })
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ documents: data || [] })
}