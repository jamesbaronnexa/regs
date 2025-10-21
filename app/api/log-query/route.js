import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const data = await request.json()

    const { error } = await supabase
      .from('query_logs')
      .insert({
        query_id: data.query_id,
        query_text: data.query_text,
        query_type: data.query_type,
        document_id: data.document_id,
        timestamp: data.timestamp,
        result_section: data.result_section,
        result_title: data.result_title,
        result_page: data.result_page,
        result_found: data.result_found,
        alternatives_count: data.alternatives_count,
        completed_at: new Date().toISOString()
      })

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error logging query:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}