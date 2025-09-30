// /app/api/upload-and-parse/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AS_NZS_3000_TOC, getParentSection } from '../../lib/hardcoded-toc'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    // Upload PDF to storage
    const fileName = `test/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, buffer, {
        contentType: 'application/pdf',
        upsert: true
      })
    
    if (uploadError) throw uploadError
    
    // Store document record
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: fileName,
        user_id: null,
        title: 'AS/NZS 3000:2018',
        document_type: 'AS/NZS 3000:2018',
        pdf_page_offset: 4,
        total_pages: 640,
        is_verified: true
      })
      .select()
      .single()
    
    if (docError) throw docError
    
    // Prepare TOC entries for database
    const tocEntries = AS_NZS_3000_TOC.map(entry => ({
      document_id: docData.id,
      section_number: entry.section,
      title: entry.title,
      document_page: entry.page,
      level: entry.level,
      parent_section: getParentSection(entry.section)
    }))
    
    // Insert in batches of 50 to avoid timeout
    for (let i = 0; i < tocEntries.length; i += 50) {
      const batch = tocEntries.slice(i, i + 50)
      const { error } = await supabase
        .from('toc')
        .insert(batch)
      
      if (error) {
        console.error('Batch insert error:', error)
        throw error
      }
    }
    
    return NextResponse.json({
      success: true,
      documentId: docData.id,
      tocCount: tocEntries.length
    })
    
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to process file'
    }, { status: 500 })
  }
}