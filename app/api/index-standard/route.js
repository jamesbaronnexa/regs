// /app/api/index-standard/route.js
import { NextResponse } from 'next/server'
import { DocumentAnalysisClient, AzureKeyCredential } from "@azure/ai-form-recognizer"
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Initialize Azure client only if credentials exist
let azureClient = null
if (process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY) {
  azureClient = new DocumentAnalysisClient(
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY)
  )
}

export async function POST(request) {
  try {
    console.log('🚀 Azure indexing process started...')
    
    if (!azureClient) {
      console.error('❌ Azure credentials not configured')
      return NextResponse.json({ 
        error: 'Azure Document Intelligence not configured. Please add AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY to your environment variables.' 
      }, { status: 500 })
    }
    
    const { referenceDocId, documentId, fileName } = await request.json()
    
    console.log(`📄 Reference Doc ID: ${referenceDocId}`)
    console.log(`📄 Document ID: ${documentId}`)
    console.log(`📄 File: ${fileName}`)
    
    // Check if already indexed
    const { data: refDoc } = await supabase
      .from('reference_documents')
      .select('indexed_at, total_pages')
      .eq('id', referenceDocId)
      .single()
    
    if (refDoc?.indexed_at) {
      console.log(`✅ Already indexed at ${refDoc.indexed_at}`)
      return NextResponse.json({
        success: true,
        alreadyIndexed: true,
        indexedAt: refDoc.indexed_at,
        totalPages: refDoc.total_pages
      })
    }
    
    // Download PDF from storage
    console.log(`📥 Downloading PDF from storage: ${fileName}`)
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from('pdfs')
      .download(fileName)
    
    if (downloadError) {
      console.error('❌ Download error:', downloadError)
      throw downloadError
    }
    
    // Convert to buffer
    const buffer = Buffer.from(await pdfData.arrayBuffer())
    console.log(`📊 PDF size: ${buffer.length} bytes`)
    
    // Get TOC entries for mapping
    console.log('📚 Fetching TOC entries...')
    const { data: tocEntries } = await supabase
      .from('toc')
      .select('id, section_number, document_page, title')
      .eq('document_id', documentId)
      .order('document_page')
    
    console.log(`📚 Found ${tocEntries?.length || 0} TOC entries`)
    
    // Analyze with Azure
    console.log('🔍 Starting Azure Document Intelligence analysis...')
    console.log('⏳ This may take a few minutes for 600 pages...')
    
    const poller = await azureClient.beginAnalyzeDocument(
      "prebuilt-layout",
      buffer,
      {
        pages: "1-600" // Process all pages
      }
    )
    
    console.log('⏳ Waiting for Azure to complete analysis...')
    const result = await poller.pollUntilDone()
    console.log(`✅ Azure analysis complete! Found ${result.pages.length} pages`)
    
    // Process pages and insert to reference_content
    const contentBatch = []
    let processedPages = 0
    
    for (const page of result.pages) {
      // Extract all text from page
      const pageText = page.lines
        ?.map(line => line.content)
        .join(' ') || ''
      
      // Find which TOC entry this page belongs to
      const tocEntry = tocEntries?.find(toc => {
        const currentIdx = tocEntries.indexOf(toc)
        const nextToc = tocEntries[currentIdx + 1]
        return toc.document_page <= page.pageNumber && 
               (!nextToc || nextToc.document_page > page.pageNumber)
      })
      
      // Add page offset if needed (your documents table has pdf_page_offset)
      const documentPage = page.pageNumber + 4 // You mentioned offset of 4 in your documents table
      
      contentBatch.push({
        reference_doc_id: referenceDocId,
        toc_id: tocEntry?.id || null,
        page_number: page.pageNumber,      // Physical page number in PDF (1-600)
        document_page: documentPage,        // Logical page number with offset (5-604)
        page_content: pageText
      })
      
      processedPages++
      
      // Insert in batches of 50
      if (contentBatch.length >= 50) {
        console.log(`📝 Inserting pages ${processedPages - 49} to ${processedPages}...`)
        const { error: insertError } = await supabase
          .from('reference_content')
          .insert(contentBatch)
        
        if (insertError) {
          console.error('❌ Insert error:', insertError)
          throw insertError
        }
        
        contentBatch.length = 0
      }
    }
    
    // Insert remaining pages
    if (contentBatch.length > 0) {
      console.log(`📝 Inserting final ${contentBatch.length} pages...`)
      const { error: insertError } = await supabase
        .from('reference_content')
        .insert(contentBatch)
      
      if (insertError) {
        console.error('❌ Insert error:', insertError)
        throw insertError
      }
    }
    
    // Mark as indexed
    console.log('✅ Marking reference document as indexed...')
    const { error: updateError } = await supabase
      .from('reference_documents')
      .update({ 
        indexed_at: new Date().toISOString(),
        total_pages: result.pages.length
      })
      .eq('id', referenceDocId)
    
    if (updateError) {
      console.error('❌ Update error:', updateError)
      throw updateError
    }
    
    // Mark document as verified
    await supabase
      .from('documents')
      .update({ is_verified: true })
      .eq('id', documentId)
    
    console.log('🎉 Indexing complete!')
    
    return NextResponse.json({
      success: true,
      pagesIndexed: result.pages.length,
      referenceDocId: referenceDocId,
      message: `Successfully indexed ${result.pages.length} pages!`
    })
    
  } catch (error) {
    console.error('❌ Azure indexing error:', error)
    return NextResponse.json({ 
      error: error.message || 'Failed to index document'
    }, { status: 500 })
  }
}