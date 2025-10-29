import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function POST(request) {
  try {
    const body = await request.json()
    const { question, documentId } = body

    console.log('🤖 Claude Search Request:', {
      question: question?.substring(0, 50),
      documentId
    })

    if (!question || !documentId) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        message: 'Need: question, documentId'
      }, { status: 400 })
    }

    // Step 1: Get document info
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .select('document_type, title, pdf_page_offset')
      .eq('id', documentId)
      .single()

    if (docError || !docData) {
      console.error('❌ Document fetch error:', docError)
      return NextResponse.json({ 
        error: 'Document not found',
        message: docError?.message || 'No document with that ID'
      }, { status: 404 })
    }

    console.log(`📄 Document: ${docData.title}`)

    // Step 2: Use Claude to intelligently expand the search query
    console.log('🤖 Claude analyzing question and generating search strategies...')
    
    const searchStrategyPrompt = `You are a search query expert for building regulations and standards documents.

User's question: "${question}"
Document: ${docData.title}

Your task: Generate 5 different search queries that would help find the answer to this question in the table of contents. Think about:
- Different ways to phrase the concept
- Technical terms and regulations terminology
- Related topics and sections
- Both specific and general approaches

Return ONLY a JSON array of 5 search query strings, nothing else. Example format:
["query 1", "query 2", "query 3", "query 4", "query 5"]`

    const searchStrategyResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      temperature: 0.7, // Higher temperature for diverse queries
      messages: [{
        role: 'user',
        content: searchStrategyPrompt
      }]
    })

    let searchQueries
    try {
      const responseText = searchStrategyResponse.content[0].text.trim()
      searchQueries = JSON.parse(responseText)
      console.log('🔍 Generated search queries:', searchQueries)
    } catch (e) {
      console.error('Failed to parse search queries, using original:', e)
      searchQueries = [question] // Fallback to original question
    }

    // Step 3: Execute multiple searches and combine results
    const allSearchResults = []
    const seenIds = new Set()

    for (const searchQuery of searchQueries) {
      console.log(`  Searching: "${searchQuery}"`)
      
      // Get base URL - works in both dev and production
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
      
      const searchResponse = await fetch(`${baseUrl}/api/search-toc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: documentId,
          query: searchQuery
        })
      })

      const searchData = await searchResponse.json()
      
      if (searchData.results && Array.isArray(searchData.results)) {
        // Add unique results
        for (const result of searchData.results.slice(0, 3)) { // Top 3 from each search
          if (!seenIds.has(result.id)) {
            seenIds.add(result.id)
            allSearchResults.push({
              ...result,
              foundBy: searchQuery
            })
          }
        }
      }
    }

    console.log(`✅ Combined results: ${allSearchResults.length} unique sections found`)

    if (allSearchResults.length === 0) {
      console.log('❌ No search results found across all queries')
      return NextResponse.json({
        success: true,
        answer: "I couldn't find any relevant sections for that question in this document. Try rephrasing or asking about a different topic.",
        sections: [],
        metadata: {
          question,
          document: docData.title,
          searchResultCount: 0,
          queriesGenerated: searchQueries
        }
      })
    }

    // Sort by original search score (best matches first)
    allSearchResults.sort((a, b) => (b.score || 0) - (a.score || 0))
    
    console.log('Top 5 combined results:')
    allSearchResults.slice(0, 5).forEach((r, i) => {
      console.log(`  ${i+1}. [${r.score?.toFixed(0) || 0}] ${r.section_number}: ${r.title} (found by: "${r.foundBy}")`)
    })

    // Step 3: Get reference document ID
    const { data: refDocData, error: refDocError } = await supabase
      .from('reference_documents')
      .select('id, standard_code')
      .eq('standard_code', docData.document_type)
      .single()

    if (refDocError || !refDocData) {
      console.error('❌ Reference document error:', refDocError)
      return NextResponse.json({ 
        error: 'Reference document not found',
        message: `No indexed content for: ${docData.document_type}`
      }, { status: 404 })
    }

    // Step 4: Fetch page content for top results (load more pages around each result)
    const pagePromises = allSearchResults.slice(0, 5).map(async (result) => {
      const startPage = Math.max(1, result.document_page - 5)
      const endPage = result.document_page + 12
      
      const { data: pages } = await supabase
        .from('reference_content')
        .select('page_content, page_number')
        .eq('reference_doc_id', refDocData.id)
        .gte('page_number', startPage)
        .lte('page_number', endPage)
        .order('page_number', { ascending: true })
      
      return {
        section: result.section_number,
        title: result.title,
        page: result.document_page,
        content: pages?.map(p => `--- Page ${p.page_number} ---\n${p.page_content}`).join('\n\n') || ''
      }
    })

    const sectionsWithContent = await Promise.all(pagePromises)
    const totalChars = sectionsWithContent.reduce((sum, s) => sum + s.content.length, 0)
    
    console.log(`📚 Loaded content from ${sectionsWithContent.length} sections (${totalChars} chars total)`)

    // Step 5: Build prompt for Claude
    const systemPrompt = `You are Regs, a helpful assistant for electricians and tradespeople in New Zealand. 
You answer questions based on building and electrical standards and regulations.

Your role:
- Read the provided regulation content VERY CAREFULLY, especially tables
- Answer the user's specific question in plain, practical language
- Cite specific clause numbers, tables, and pages when relevant
- Use tradie terminology (e.g., "power point" not "socket outlet", "safety switch" not "RCD")
- Be direct and concise - tradespeople are on-site and need quick answers
- If the content doesn't fully answer the question, say so honestly

CRITICAL - Reading Tables Correctly:
- When you see a table about studs, the column headers showing heights (e.g., "2.4", "2.7", "3.0", "3.6", "4.2", "4.8") represent MAXIMUM HEIGHTS in meters
- Pay attention to WHAT STUD SIZE is required at each height
- The question is usually about STANDARD single studs (like 90x45mm), not large built-up members
- If the table shows 90x45mm works up to 3.0m but requires 140x45mm or larger for 4.8m, make this distinction clear
- When someone asks "max height before double stud", they want to know when a STANDARD single stud stops being sufficient
- Built-up members (2/45mm, 3/45mm) or very large sections (190x45mm) are effectively "double studs" or special cases
- Be specific: "Standard 90x45mm single studs max out at X meters; beyond that you need larger sections or built-up members"

Formatting:
- Start with the direct answer in bold
- Provide supporting details with clause/table references
- Use **bold** for key measurements, sizes, or requirements
- End with any important warnings or notes
- Reference page numbers so users can verify: "See page X" or "Table Y on page Z"

Keep answers to 2-4 paragraphs maximum unless the question requires more detail.`

    const contentBlocks = sectionsWithContent.map((section, idx) => 
      `## Section ${idx + 1}: ${section.section} - ${section.title} (Page ${section.page})

${section.content}

---`
    ).join('\n\n')

    const userPrompt = `Document: ${docData.title}

User's Question: ${question}

Relevant sections found:
${contentBlocks}

Please provide a direct, practical answer to the user's question based on these regulation sections. Make sure to cite specific pages, tables, and clause numbers so the user can verify the information.`

    console.log('🚀 Sending to Claude...')

    // Step 6: Call Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userPrompt
      }]
    })

    const answer = message.content[0].text

    console.log(`✅ Claude response: ${answer.length} chars`)
    console.log(`📊 Tokens used: ${message.usage.input_tokens} input, ${message.usage.output_tokens} output`)

    // Step 7: Extract page references from the answer for clickable links
    const pageReferences = []
    const pageMatches = answer.matchAll(/(?:page|pg\.?)\s*(\d+)/gi)
    const tableMatches = answer.matchAll(/table\s+[\d.]+.*?(?:page|pg\.?)\s*(\d+)/gi)
    
    for (const match of pageMatches) {
      const page = parseInt(match[1])
      if (!pageReferences.find(p => p.page === page)) {
        pageReferences.push({ page, type: 'page' })
      }
    }
    
    for (const match of tableMatches) {
      const page = parseInt(match[1])
      if (!pageReferences.find(p => p.page === page)) {
        pageReferences.push({ page, type: 'table' })
      }
    }

    // Step 8: Return answer with metadata
    return NextResponse.json({
      success: true,
      answer: answer,
      sections: allSearchResults.slice(0, 5).map(r => ({
        section_number: r.section_number,
        title: r.title,
        page: r.document_page,
        pdfPage: r.document_page + (docData.pdf_page_offset || 0),
        foundBy: r.foundBy
      })),
      pageReferences: pageReferences,
      metadata: {
        question,
        document: docData.title,
        searchResultCount: allSearchResults.length,
        sectionsAnalyzed: sectionsWithContent.length,
        tokensUsed: searchStrategyResponse.usage.input_tokens + searchStrategyResponse.usage.output_tokens + message.usage.input_tokens + message.usage.output_tokens,
        model: 'claude-sonnet-4',
        searchQueries: searchQueries
      }
    })

  } catch (error) {
    console.error('❌ Error:', error)
    return NextResponse.json({ 
      error: 'Failed to process request',
      message: error.message 
    }, { status: 500 })
  }
}