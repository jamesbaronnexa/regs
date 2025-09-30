// /app/api/search-toc/route.js
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { AS_NZS_3000_TOC } from '../../lib/hardcoded-toc'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(request) {
  try {
    const { query } = await request.json()
    
    if (!query) {
      return NextResponse.json({ error: 'No query provided' }, { status: 400 })
    }
    
    // Create a condensed TOC for AI to search
    const tocList = AS_NZS_3000_TOC
      .map(e => `${e.section}: ${e.title} (Page ${e.page})${e.keywords ? ` [${e.keywords}]` : ''}`)
      .join('\n')
    
    // Simple AI call to find relevant sections
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // Fast and cheap
      messages: [
        {
          role: "system",
          content: `You're an expert on AS/NZS 3000:2018. An electrician is asking about: "${query}"
          
Find the most relevant sections (max 6). Return ONLY section numbers separated by commas.
Example: 2.10.2,2.10.3,5.3.4`
        },
        {
          role: "user",
          content: tocList
        }
      ],
      temperature: 0.3,
      max_tokens: 50
    })
    
    // Parse AI response
    const sections = completion.choices[0].message.content
      .split(',')
      .map(s => s.trim())
      .filter(s => s)
    
    // Look up full details
    const results = []
    for (const sectionNum of sections) {
      const entry = AS_NZS_3000_TOC.find(e => e.section === sectionNum)
      if (entry) {
        results.push({
          id: entry.section,
          title: entry.title,
          page: entry.page,
          score: results.length === 0 ? 1.0 : 0.8 - (results.length * 0.1)
        })
      }
    }
    
    if (results.length === 0) {
      return NextResponse.json({
        selection: null,
        alternatives: [],
        error: "No matches found"
      })
    }
    
    // Format response for your page.js
    return NextResponse.json({
      selection: results[0],
      alternatives: results.slice(1),
      autoOpen: true,
      meta: { top: results[0]?.score || 0 }
    })
    
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ 
      error: 'Search failed' 
    }, { status: 500 })
  }
}