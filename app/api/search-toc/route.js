// /app/api/search-toc/route.js
// THIS IS THE NEW SEARCH ENDPOINT - Create this as a NEW file!

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  try {
    const { documentId, query } = await request.json()
    
    if (!documentId || !query) {
      return NextResponse.json({ error: 'Document ID and query required' }, { status: 400 })
    }
    
    console.log(`🔍 Searching doc ${documentId} for: "${query}"`)
    
    // Fetch ALL TOC entries for this document
    const { data, error } = await supabase
      .from('toc')
      .select('*')
      .eq('document_id', documentId)
      .order('document_page')
    
    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    if (!data || data.length === 0) {
      return NextResponse.json({ results: [] })
    }
    
    // Normalize query for matching
    const queryLower = query.toLowerCase().trim()
    const searchTerms = queryLower.split(/\s+/).filter(t => t.length > 1) // Min 2 chars
    
    // Extract key concepts from query (generic terms that work for all documents)
    const hasTable = /table/i.test(query)
    const hasFigure = /figure/i.test(query)
    const hasAppendix = /appendix/i.test(query)
    const hasSize = /size|dimension|span|length|width|height|spacing|distance/i.test(query)
    const hasRequirement = /require|minimum|maximum|min|max/i.test(query)
    
    // Extract numbers (section refs, dimensions, etc)
    const queryNumbers = queryLower.match(/\d+(\.\d+)*/g)
    
    // Detect if asking for specifications/sizing (wants tables, not figures)
    const wantsSpecifications = hasSize || hasRequirement || /what|how much|how many/i.test(query)
    
    // Score each TOC entry
    const scored = data.map(entry => {
      const sectionLower = (entry.section_number || '').toLowerCase()
      const titleLower = (entry.title || '').toLowerCase()
      const combinedText = `${sectionLower} ${titleLower}`
      
      let score = 0
      let matchDetails = []
      
      // === PRIORITY 1: EXACT MATCHES ===
      
      // Exact section number match (highest priority)
      if (sectionLower === queryLower) {
        score += 500
        matchDetails.push('exact section')
      }
      
      // Section number contains exact query
      if (sectionLower.includes(queryLower)) {
        score += 200
        matchDetails.push('section contains query')
      }
      
      // Section number starts with query
      if (sectionLower.startsWith(queryLower)) {
        score += 150
        matchDetails.push('section starts')
      }
      
      // === PRIORITY 2: CONTENT TYPE PREFERENCES ===
      
      // When asking for specifications, prioritize tables over figures
      if (wantsSpecifications) {
        if (sectionLower.startsWith('table')) {
          score += 150
          matchDetails.push('table for specs')
        }
        if (sectionLower.startsWith('figure')) {
          score -= 30
          matchDetails.push('figure penalty')
        }
      }
      
      // Direct table/figure mention in query
      if (hasTable && sectionLower.includes('table')) {
        score += 120
        matchDetails.push('table match')
      }
      if (hasFigure && sectionLower.includes('figure')) {
        score += 120
        matchDetails.push('figure match')
      }
      if (hasAppendix && sectionLower.includes('appendix')) {
        score += 120
        matchDetails.push('appendix match')
      }
      
      // === PRIORITY 3: TITLE MATCHING ===
      
      // Exact full phrase in title
      if (titleLower.includes(queryLower)) {
        score += 180
        matchDetails.push('exact phrase in title')
      }
      
      // All meaningful terms present in title
      const stopWords = ['the', 'and', 'for', 'with', 'from', 'what', 'how', 'where', 
                         'when', 'is', 'a', 'an', 'to', 'in', 'on', 'at', 'of', 'or']
      const meaningfulTerms = searchTerms.filter(t => !stopWords.includes(t))
      
      const allTermsInTitle = meaningfulTerms.every(term => 
        titleLower.includes(term) || sectionLower.includes(term)
      )
      if (allTermsInTitle && meaningfulTerms.length >= 2) {
        score += 100
        matchDetails.push(`all ${meaningfulTerms.length} terms`)
      }
      
      // === PRIORITY 4: KEYWORD MATCHING ===
      
      let titleKeywordCount = 0
      let sectionKeywordCount = 0
      
      meaningfulTerms.forEach(term => {
        // Title contains term
        if (titleLower.includes(term)) {
          score += 25
          titleKeywordCount++
        }
        
        // Section number contains term
        if (sectionLower.includes(term)) {
          score += 30
          sectionKeywordCount++
        }
        
        // Word boundary match (whole word)
        const wordRegex = new RegExp(`\\b${term}\\b`, 'i')
        if (wordRegex.test(titleLower)) {
          score += 15
        }
      })
      
      // Bonus for multiple matches
      if (titleKeywordCount >= 2) {
        score += titleKeywordCount * 10
        matchDetails.push(`${titleKeywordCount} title keywords`)
      }
      
      // === PRIORITY 5: NUMBER MATCHING ===
      
      const sectionNumbers = sectionLower.match(/\d+(\.\d+)*/g)
      
      if (queryNumbers && sectionNumbers) {
        queryNumbers.forEach(qNum => {
          sectionNumbers.forEach(sNum => {
            if (sNum === qNum) {
              score += 40
              matchDetails.push(`number ${qNum}`)
            } else if (sNum.startsWith(qNum + '.')) {
              score += 25
              matchDetails.push(`subsection ${qNum}`)
            }
          })
        })
      }
      
      // === PRIORITY 6: SEMANTIC GROUPING ===
      
      // Boost sections in the same "family" (e.g., all 7.x sections for floor queries)
      if (meaningfulTerms.length > 0) {
        const firstTerm = meaningfulTerms[0]
        // Count how many times the first meaningful term appears
        const termCount = (titleLower.match(new RegExp(firstTerm, 'g')) || []).length
        if (termCount > 1) {
          score += termCount * 5
        }
      }
      
      return { 
        ...entry, 
        score,
        _matchDetails: matchDetails.join(', ')
      }
    })
    
    // Filter and sort results
    const results = scored
      .filter(e => e.score > 0)
      .sort((a, b) => {
        // Sort by score first
        if (b.score !== a.score) return b.score - a.score
        // Then by page number (earlier pages first)
        return (a.document_page || a.page || 0) - (b.document_page || b.page || 0)
      })
      .slice(0, 20) // Top 20 results
    
    console.log(`✅ Found ${results.length} matches (from ${data.length} entries)`)
    
    if (results.length > 0) {
      console.log(`📌 Top 3 matches:`)
      results.slice(0, 3).forEach((r, i) => {
        console.log(`  ${i+1}. ${r.section_number} - ${r.title}`)
        console.log(`     Score: ${r.score} | Matches: ${r._matchDetails}`)
      })
    }
    
    return NextResponse.json({ results })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}