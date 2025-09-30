import { NextResponse } from 'next/server'

export async function POST(request) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
  }

  try {
    const { sdp } = await request.json()
    
    if (!sdp) {
      throw new Error('No SDP in request body')
    }
    
    // Use the realtime model
    const model = 'gpt-4o-realtime-preview-2024-12-17'
    const url = `https://api.openai.com/v1/realtime?model=${model}`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/sdp',
        'OpenAI-Beta': 'realtime=v1'
      },
      body: sdp
    })

    const responseText = await response.text()
    
    if (!response.ok) {
      console.error('OpenAI error:', responseText)
      return NextResponse.json({ error: responseText }, { status: response.status })
    }
    
    return NextResponse.json({ sdp: responseText })
    
  } catch (error) {
    console.error('Server error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}