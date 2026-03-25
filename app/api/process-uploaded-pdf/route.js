// /app/api/process-uploaded-pdf/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { detectDocumentType } from '../../lib/hardcoded-toc'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

async function generateTocEmbeddings(documentId, tocEntries) {
  const { data: dbTocEntries, error: fetchError } = await supabase
    .from('toc')
    .select('id, section_number, title, full_path')
    .eq('document_id', documentId)
    .order('document_page', { ascending: true })
  
  if (fetchError) throw fetchError
  
  console.log(`Generating embeddings for ${dbTocEntries.length} entries...`)
  
  const batchSize = 100
  
  for (let i = 0; i < dbTocEntries.length; i += batchSize) {
    const batch = dbTocEntries.slice(i, i + batchSize)
    
    const inputs = batch.map(entry => {
      const parts = [entry.section_number, entry.title]
      if (entry.full_path) parts.push(entry.full_path)
      return parts.filter(Boolean).join(' - ')
    })
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: inputs
    })
    
    for (let idx = 0; idx < batch.length; idx++) {
      const { error } = await supabase
        .from('toc')
        .update({ embedding: response.data[idx].embedding })
        .eq('id', batch[idx].id)
      
      if (error) {
        console.error(`Failed to update embedding for TOC id ${batch[idx].id}:`, error)
      }
    }
    
    console.log(`Processed embeddings batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(dbTocEntries.length/batchSize)}`)
  }
}

export async function POST(request) {
  try {
    const { fileName, originalName, fileSize } = await request.json()
    
    console.log(`Processing uploaded file: ${originalName} (${fileSize} bytes)`)
    
    // DETECT DOCUMENT TYPE FROM FILENAME
    const docConfig = detectDocumentType(originalName)
    
    if (!docConfig) {
      return NextResponse.json({ 
        error: 'Unknown document type. Filename must contain document identifier (e.g., "3604", "e2")' 
      }, { status: 400 })
    }
    
    console.log(`Detected document: ${docConfig.title}`)
    
    // Check if this standard is already indexed
    const { data: existingRef } = await supabase
      .from('reference_documents')
      .select('id, indexed_at, total_pages')
      .eq('standard_code', docConfig.standard_code)
      .single()
    
    // Create document record
    console.log('Creating document record...')
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({
        filename: fileName,
        user_id: null,
        title: docConfig.title,
        document_type: docConfig.standard_code,
        pdf_page_offset: docConfig.pdf_page_offset,
        total_pages: docConfig.total_pages,
        is_verified: existingRef?.indexed_at ? true : false
      })
      .select()
      .single()
    
    if (docError) throw docError
    console.log(`Document created with ID: ${docData.id}`)
    
    // If already fully indexed, skip TOC creation
    if (existingRef && existingRef.indexed_at) {
      console.log(`Standard already indexed! Using shared content`)
      
      return NextResponse.json({
        success: true,
        documentId: docData.id,
        fileName: fileName,
        message: `${docConfig.title} ready - using pre-indexed content!`,
        alreadyIndexed: true
      })
    }
    
    // Create TOC entries
    console.log('Creating TOC entries...')
    
    const { count: existingTocCount } = await supabase
      .from('toc')
      .select('*', { count: 'exact', head: true })
      .eq('document_id', docData.id)
    
    let tocCount = existingTocCount || 0
    
    if (tocCount === 0) {
      const tocEntries = docConfig.toc.map(entry => ({
        document_id: docData.id,
        section_number: entry.section,
        title: entry.title,
        document_page: entry.page,
        level: entry.level,
        entry_type: entry.entry_type || null,
        parent_section: entry.parent_section || null,
        full_path: entry.full_path || null
      }))
      
      // Insert in batches of 50
      for (let i = 0; i < tocEntries.length; i += 50) {
        const batch = tocEntries.slice(i, i + 50)
        const { error } = await supabase.from('toc').insert(batch)
        if (error) throw error
      }
      
      tocCount = tocEntries.length
      console.log(`Created ${tocCount} TOC entries`)
      
      // Generate embeddings
      console.log('Generating embeddings...')
      try {
        await generateTocEmbeddings(docData.id, docConfig.toc)
        console.log('Embeddings generated successfully')
      } catch (embeddingError) {
        console.error('Warning: Embedding generation failed:', embeddingError)
      }
    }
    
    return NextResponse.json({
      success: true,
      documentId: docData.id,
      fileName: fileName,
      message: `${docConfig.title} processed successfully!`,
      tocCount: tocCount
    })
    
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to process file'
    }, { status: 500 })
  }
}