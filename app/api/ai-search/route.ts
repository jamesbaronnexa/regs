import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateSingleEmbedding } from '../lib/openai-client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
  try {
    const { query, documentIds, category, searchMode = 'hybrid' } = await request.json()
    
    if (!query) {
      return NextResponse.json({ error: 'Query required' }, { status: 400 })
    }

    console.log(`Searching for: "${query}" in mode: ${searchMode}`)
    
    // Generate embedding for semantic search
    const queryEmbedding = await generateSingleEmbedding(query)
    
    // Build base query
    let dbQuery = supabase.rpc('hybrid_search', {
      query_embedding: queryEmbedding,
      query_text: query.toLowerCase(),
      match_threshold: 0.7,  // Similarity threshold
      match_count: 10,       // Number of results
      document_ids: documentIds || null
    })

    const { data: results, error } = await dbQuery

    if (error) {
      console.error('Search error:', error)
      throw error
    }

    // Post-process results for better relevance
    const processedResults = results?.map(result => ({
      ...result,
      relevance_score: calculateRelevance(result, query)
    }))
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 5)  // Return top 5 most relevant

    return NextResponse.json({
      results: processedResults || [],
      query,
      mode: searchMode,
      count: processedResults?.length || 0
    })
    
  } catch (error) {
    console.error('AI Search error:', error)
    return NextResponse.json(
      { error: 'Search failed', details: error.message },
      { status: 500 }
    )
  }
}

// Calculate relevance based on multiple factors
function calculateRelevance(result: any, query: string) {
  let score = result.similarity || 0
  const queryLower = query.toLowerCase()
  const contentLower = result.content.toLowerCase()
  
  // Boost for exact phrase match
  if (contentLower.includes(queryLower)) {
    score += 0.3
  }
  
  // Boost for title/section match
  if (result.section_title?.toLowerCase().includes(queryLower)) {
    score += 0.2
  }
  
  // Boost for clause number match (e.g., "1.4.16")
  const clauseMatch = query.match(/\d+\.[\d.]+/)
  if (clauseMatch && result.section_number?.includes(clauseMatch[0])) {
    score += 0.4
  }
  
  // Boost for key topic match
  const queryWords = queryLower.split(/\s+/)
  const topicMatches = result.key_topics?.filter(topic => 
    queryWords.some(word => topic.includes(word))
  ).length || 0
  score += topicMatches * 0.1
  
  return Math.min(score, 1.0)  // Cap at 1.0
}