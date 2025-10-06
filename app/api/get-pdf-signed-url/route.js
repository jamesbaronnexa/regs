// /app/api/get-pdf-signed-url/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const filename = searchParams.get('filename')
    
    if (!filename) {
      return NextResponse.json({ error: 'Filename required' }, { status: 400 })
    }
    
    // Create a signed URL that expires in 1 hour
    const { data, error } = await supabase.storage
      .from('pdfs')
      .createSignedUrl(filename, 3600) // 3600 seconds = 1 hour
    
    if (error) throw error
    
    return NextResponse.json({ url: data.signedUrl })
  } catch (error) {
    console.error('Error creating signed URL:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}