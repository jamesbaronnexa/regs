import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const {
      query_id,
      query_text,
      query_type,
      document_id,
      timestamp,
      result_section,
      result_title,
      result_page,
      result_found,
      alternatives_count
    } = await request.json()

    // If this is a new query (has query_text), insert it
    if (query_text) {
      const { error: insertError } = await supabase
        .from('query_logs')
        .insert({
          query_id,
          query_text,
          query_type,
          document_id,
          timestamp
        })

      if (insertError) throw insertError
    }

    // If this is a result update (has result_section), update the existing record
    if (result_section !== undefined) {
      const { error: updateError } = await supabase
        .from('query_logs')
        .update({
          result_section,
          result_title,
          result_page,
          result_found,
          alternatives_count,
          completed_at: new Date().toISOString()
        })
        .eq('query_id', query_id)

      if (updateError) throw updateError
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error logging query:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}