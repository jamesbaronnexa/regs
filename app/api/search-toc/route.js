// /app/api/search-toc/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0)
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0))
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0))
  if (magnitudeA === 0 || magnitudeB === 0) return 0
  return dotProduct / (magnitudeA * magnitudeB)
}

export async function POST(request) {
  try {
    const { documentId, query } = await request.json()
    
    if (!documentId || !query) {
      return NextResponse.json({ error: 'Document ID and query required' }, { status: 400 })
    }
    
    console.log(`🔍 Hybrid search on doc ${documentId} for: "${query}"`)
    
    // Step 1: Fetch TOC entries using raw SQL to properly get vector data
    const { data, error } = await supabase.rpc('get_toc_with_embeddings', {
      doc_id: documentId
    })
    
    // Fallback: If RPC doesn't exist, create it or use direct query
    let tocData = data
    if (error || !data) {
      console.log('⚠️ RPC not found, using direct query...')
      
      // Direct SQL query that converts vector to array
      const { data: rawData, error: rawError } = await supabase
        .from('toc')
        .select('id, document_id, section_number, title, document_page, level, entry_type, parent_section, full_path, embedding::text')
        .eq('document_id', documentId)
        .order('document_page')
      
      if (rawError) {
        console.error('Supabase error:', rawError)
        return NextResponse.json({ error: rawError.message }, { status: 500 })
      }
      
      // Parse the text representation of vectors back to arrays
      tocData = rawData.map(row => {
        if (row.embedding && typeof row.embedding === 'string') {
          // Parse "[0.1, 0.2, 0.3, ...]" format
          try {
            const cleaned = row.embedding.replace(/[\[\]]/g, '')
            row.embedding = cleaned.split(',').map(v => parseFloat(v.trim()))
          } catch (e) {
            console.error('Failed to parse embedding for', row.id)
            row.embedding = null
          }
        }
        return row
      })
    }
    
    if (!tocData || tocData.length === 0) {
      return NextResponse.json({ results: [] })
    }
    
    // Step 2: Check if embeddings exist
    const entriesWithEmbeddings = tocData.filter(e => e.embedding && Array.isArray(e.embedding) && e.embedding.length > 0)
    const hasEmbeddings = entriesWithEmbeddings.length > 0
    
    console.log(`📊 TOC entries: ${tocData.length}, With embeddings: ${entriesWithEmbeddings.length}`)
    
    // Step 3: Generate query embedding only if we have embeddings in DB
    let queryEmbedding = null
    if (hasEmbeddings) {
      try {
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: query
        })
        queryEmbedding = embeddingResponse.data[0].embedding
        console.log(`✅ Generated query embedding (${queryEmbedding.length} dimensions)`)
      } catch (embError) {
        console.error('⚠️ Failed to generate embedding:', embError.message)
      }
    } else {
      console.log('⚠️ No embeddings found in TOC - using keyword-only search')
    }
    
    // Step 4: Calculate scores
    const queryLower = query.toLowerCase().trim()
    const searchTerms = queryLower.split(/\s+/).filter(t => t.length > 1)
    
    // Remove common stop words
    const stopWords = ['the', 'and', 'for', 'with', 'from', 'what', 'how', 'where', 
                       'when', 'is', 'a', 'an', 'to', 'in', 'on', 'at', 'of', 'or', 'between']
    const keywords = searchTerms.filter(t => !stopWords.includes(t))
    
    console.log(`🔑 Keywords: ${keywords.join(', ')}`)
    
    const scored = tocData.map(entry => {
      const sectionLower = (entry.section_number || '').toLowerCase()
      const titleLower = (entry.title || '').toLowerCase()
      const fullPathLower = (entry.full_path || '').toLowerCase()
      
      // KEYWORD SCORING
      let keywordScore = 0
      
      // 1. Exact section number match
      if (sectionLower === queryLower) {
        keywordScore += 1000
      }
      
      // 2. Section number contains query
      if (sectionLower.includes(queryLower)) {
        keywordScore += 500
      }
      
      // 3. Title contains full query phrase
      if (titleLower.includes(queryLower)) {
        keywordScore += 300
      }
      
      // 4. Full path contains query
      if (fullPathLower.includes(queryLower)) {
        keywordScore += 200
      }
      
      // 5. Count keyword matches
      let keywordMatches = 0
      keywords.forEach(keyword => {
        if (titleLower.includes(keyword)) {
          keywordScore += 50
          keywordMatches++
        }
        if (sectionLower.includes(keyword)) {
          keywordScore += 30
        }
        if (fullPathLower.includes(keyword)) {
          keywordScore += 20
        }
      })
      
      // 6. Bonus if most keywords match
      if (keywordMatches >= keywords.length * 0.5 && keywords.length > 1) {
        keywordScore += 100
      }
      
      // Normalize keyword score to 0-1
      const normalizedKeywordScore = Math.min(keywordScore / 1500, 1)
      
      // SEMANTIC SCORING
      let semanticScore = 0
      if (queryEmbedding && entry.embedding && Array.isArray(entry.embedding)) {
        const similarity = cosineSimilarity(queryEmbedding, entry.embedding)
        // Cosine similarity returns -1 to 1, normalize to 0-1
        semanticScore = Math.max(0, (similarity + 1) / 2)
      }
      
      // HYBRID SCORE
      let finalScore
      if (hasEmbeddings && queryEmbedding) {
        // Use hybrid if embeddings available
        finalScore = (normalizedKeywordScore * 0.3) + (semanticScore * 0.7)
      } else {
        // Fall back to keyword-only
        finalScore = normalizedKeywordScore
      }
      
      return { 
        ...entry, 
        score: finalScore * 1000,
        keywordScore: normalizedKeywordScore * 1000,
        semanticScore: semanticScore * 1000,
        _matchCount: keywordMatches,
        _keywords: keywords.length
      }
    })
    
    // Filter and sort
    const results = scored
      .filter(e => e.score > 10) // Minimum threshold
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return (a.document_page || a.page || 0) - (b.document_page || b.page || 0)
      })
      .slice(0, 20)
    
    console.log(`✅ Found ${results.length} matches (from ${tocData.length} entries)`)
    
    if (results.length > 0) {
      console.log(`📌 Top 5 matches:`)
      results.slice(0, 5).forEach((r, i) => {
        console.log(`  ${i+1}. [${r.score.toFixed(0)}] ${r.section_number}: ${r.title}`)
        if (hasEmbeddings && queryEmbedding) {
          console.log(`     (K:${r.keywordScore.toFixed(0)} S:${r.semanticScore.toFixed(0)} M:${r._matchCount}/${r._keywords})`)
        } else {
          console.log(`     (K:${r.keywordScore.toFixed(0)} M:${r._matchCount}/${r._keywords})`)
        }
      })
    } else {
      // Debug: Show top 5 by raw score anyway
      const top5 = scored.sort((a, b) => b.score - a.score).slice(0, 5)
      console.log(`⚠️ No matches above threshold. Top 5 scores:`)
      top5.forEach((r, i) => {
        console.log(`  ${i+1}. [${r.score.toFixed(2)}] ${r.section_number}: ${r.title}`)
      })
    }
    
    return NextResponse.json({ 
      results,
      // Include top alternatives for the frontend
      topAlternatives: results.slice(1, 4).map(r => ({
        section_number: r.section_number,
        title: r.title,
        page: r.document_page
      })),
      debug: {
        totalEntries: tocData.length,
        hasEmbeddings,
        entriesWithEmbeddings: entriesWithEmbeddings.length,
        keywordsExtracted: keywords.length
      }
    })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}