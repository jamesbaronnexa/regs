// /app/api/upload-and-parse/route.js - FIXED VERSION
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AS_NZS_3000_TOC, getParentSection } from '../../lib/hardcoded-toc'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    console.log('📤 Upload started...')
    const formData = await request.formData()
    const file = formData.get('file')
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    console.log(`📁 File received: ${file.name}, Size: ${file.size} bytes`)

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    // Calculate hash of first few pages to identify the document
    const firstPages = buffer.slice(0, 100000) // First ~100KB
    const pdfHash = crypto
      .createHash('md5')
      .update(firstPages)
      .digest('hex')
    
    console.log(`🔑 PDF hash: ${pdfHash}`)
    
    // Upload PDF to storage
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    
    console.log(`📦 Uploading to storage: ${fileName}`)
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, buffer, {
        contentType: 'application/pdf',
        upsert: true
      })
    
    if (uploadError) throw uploadError
    console.log('✅ File uploaded to storage')
    
    // CHECK FOR EXISTING STANDARD FIRST - BEFORE creating document
    console.log('🔍 Checking if standard is already indexed...')
    const { data: existingRef, error: refCheckError } = await supabase
      .from('reference_documents')
      .select('id, indexed_at, total_pages')
      .eq('standard_code', 'AS_NZS_3000_2018')
      .single()
    
    if (refCheckError && refCheckError.code !== 'PGRST116') {
      console.error('Error checking reference:', refCheckError)
    }
    
    // Store document record
    console.log('📝 Creating document record...')
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: fileName,
        user_id: null,
        title: 'AS/NZS 3000:2018',
        document_type: 'AS_NZS_3000_2018',
        pdf_page_offset: 4,
        total_pages: 640,
        is_verified: existingRef?.indexed_at ? true : false // Verify immediately if already indexed
      })
      .select()
      .single()
    
    if (docError) throw docError
    console.log(`✅ Document created with ID: ${docData.id}`)
    
    // If already fully indexed, skip TOC creation
    if (existingRef && existingRef.indexed_at) {
      console.log(`✨ Standard already indexed! Reference ID: ${existingRef.id}`)
      console.log(`📊 Indexed pages: ${existingRef.total_pages}`)
      console.log('✅ Skipping TOC creation - using shared reference content')
      
      return NextResponse.json({
        success: true,
        documentId: docData.id,
        fileName: fileName,
        message: '🚀 AS/NZS 3000:2018 detected - using pre-indexed content for instant search!',
        alreadyIndexed: true,
        referenceDocId: existingRef.id,
        totalPages: existingRef.total_pages,
        tocCount: AS_NZS_3000_TOC.length,
        sample: AS_NZS_3000_TOC.slice(0, 3)
      })
    }
    
    // Only create TOC if this is the first time indexing
    console.log('🆕 First time indexing - creating TOC entries...')
    
    // Check if TOC exists for this document
    const { count: existingTocCount } = await supabase
      .from('toc')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', docData.id)
    
    console.log(`📚 Existing TOC entries for document ${docData.id}: ${existingTocCount || 0}`)
    
    let tocCount = existingTocCount || 0
    if (tocCount === 0) {
      console.log('📝 Creating TOC entries...')
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
        console.log(`📝 Inserting TOC batch ${Math.floor(i/50) + 1}/${Math.ceil(tocEntries.length/50)}`)
        const { error } = await supabase
          .from('toc')
          .insert(batch)
        
        if (error) {
          console.error('Batch insert error:', error)
          throw error
        }
      }
      tocCount = tocEntries.length
      console.log(`✅ Created ${tocEntries.length} TOC entries`)
    } else {
      console.log(`✅ Using existing ${tocCount} TOC entries`)
    }
    
    // Create or get reference document
    let referenceDocId = existingRef?.id
    
    if (!referenceDocId) {
      // Create reference_documents entry
      console.log('📄 Creating reference document entry...')
      const { data: refDoc, error: refError } = await supabase
        .from('reference_documents')
        .insert({
          standard_code: 'AS_NZS_3000_2018',
          title: 'AS/NZS 3000:2018 Electrical Installations (Wiring Rules)',
          total_pages: 640
        })
        .select()
        .single()
      
      if (refError) throw refError
      referenceDocId = refDoc.id
      console.log(`✅ Reference document created with ID: ${referenceDocId}`)
    }
    
    // Check if content already exists
    const { count: contentCount } = await supabase
      .from('reference_content')
      .select('*', { count: 'exact', head: true })
      .eq('reference_doc_id', referenceDocId)
    
    console.log(`📄 Existing content pages: ${contentCount || 0}`)
    
    const needsIndexing = !contentCount || contentCount < 600
    
    if (needsIndexing) {
      console.log('⚡ Azure indexing required - ready to trigger indexing process')
      return NextResponse.json({
        success: true,
        documentId: docData.id,
        fileName: fileName,
        referenceDocId: referenceDocId,
        message: '📤 AS/NZS 3000:2018 uploaded. Ready for Azure indexing...',
        needsIndexing: true,
        existingPages: contentCount || 0,
        tocCount: tocCount,
        totalPages: 640,
        sample: AS_NZS_3000_TOC.slice(0, 3)
      })
    }
    
    return NextResponse.json({
      success: true,
      documentId: docData.id,
      fileName: fileName,
      tocCount: tocCount,
      totalPages: 640,
      sample: AS_NZS_3000_TOC.slice(0, 3)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to process file'
    }, { status: 500 })
  }
}