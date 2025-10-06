// /app/api/analyze-content/route.js
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(request) {
  try {
    const { content, query } = await request.json()
    
    console.log(`🧠 Analyzing content for: "${query}"`)
    console.log(`📄 Content length: ${content.length} characters`)
    
    const systemPrompt = `You are an expert electrician analyzing AS/NZS 3000:2018 wiring regulations.
    
    CRITICAL: Give the FINAL MINIMUM DISTANCE from the fixture itself.
    If zones are involved, ADD them up to get the total distance from the bath/shower/sink.
    State ONE clear distance.`
    
    const userPrompt = `REGULATION CONTENT:
${content}

ELECTRICIAN'S QUESTION: ${query}

Give the MINIMUM DISTANCE from the actual bath/shower/fixture.
If the regulation mentions zones, calculate the TOTAL distance.

Answer with ONE clear statement like:
"Minimum 1.8m from the bath - Section 6.2.4.2"
or
"Minimum 1.2m from the shower - Section X.X.X"

Just give the final distance and section number. Do the math, don't explain zones.

Answer:`
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      max_tokens: 50
    })
    
    const answer = completion.choices[0].message.content.trim()
    console.log(`✅ GPT-4 Analysis complete`)
    console.log(`📝 Answer: ${answer}`)
    
    return NextResponse.json({
      directAnswer: answer,
      success: true
    })
    
  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json({ 
      error: error.message || 'Analysis failed',
      success: false
    }, { status: 500 })
  }
}