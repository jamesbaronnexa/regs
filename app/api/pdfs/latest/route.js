// /app/api/pdfs/latest/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BUCKET = 'pdfs'

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

export async function GET() {
  try {
    // Get the page offset from the database (from documents table)
    const { data: pdfRecord, error: dbError } = await supabase
      .from('documents')
      .select('pdf_page_offset')
      .order('uploaded_at', { ascending: false })  // Using uploaded_at to get most recent
      .limit(1)
      .maybeSingle()
    
    console.log('Database query result:', pdfRecord, 'Error:', dbError)
    
    // List PDFs in the root of the bucket
    const { data: files, error } = await supabase
      .storage
      .from(BUCKET)
      .list('', { limit: 10 })

    if (error || !files || files.length === 0) {
      return NextResponse.json({ error: 'No PDFs found' }, { status: 404 })
    }

    // Find the first PDF file
    const pdf = files.find(f => f.name.toLowerCase().endsWith('.pdf'))
    
    if (!pdf) {
      return NextResponse.json({ error: 'No PDF files found' }, { status: 404 })
    }

    // Generate a signed URL (valid for 1 hour)
    const { data, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(pdf.name, 3600) // 3600 seconds = 1 hour
    
    if (signError || !data) {
      return NextResponse.json({ error: 'Failed to generate signed URL' }, { status: 500 })
    }
    
    // Return URL with page offset
    return NextResponse.json({ 
      url: data.signedUrl,
      pageOffset: pdfRecord?.pdf_page_offset || 0
    })
    
  } catch (e) {
    console.error('Error fetching PDF:', e)
    return NextResponse.json({ error: 'Failed to get PDF' }, { status: 500 })
  }
}