import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(request) {
  try {
    const formData = await request.formData()
    const audioFile = formData.get('audio')

    if (!audioFile) {
      return NextResponse.json({ 
        error: 'No audio file provided' 
      }, { status: 400 })
    }

    console.log('🎤 Transcribing audio...')

    // Call Whisper API
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en' // New Zealand English
    })

    console.log('✅ Transcription:', transcription.text)

    return NextResponse.json({
      success: true,
      text: transcription.text
    })

  } catch (error) {
    console.error('❌ Transcription error:', error)
    return NextResponse.json({ 
      error: 'Transcription failed',
      message: error.message 
    }, { status: 500 })
  }
}