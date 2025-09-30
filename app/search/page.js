'use client'

import { useState, useEffect, useRef } from 'react'
import PDFViewer from '../../components/PDFViewer'
import { AS_NZS_3000_TOC } from '../lib/hardcoded-toc'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isListening, setIsListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')

  // viewer state
  const [showViewer, setShowViewer] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [highlightPhrases, setHighlightPhrases] = useState([])

  const [pdfUrl, setPdfUrl] = useState(null)
  const [pageOffset, setPageOffset] = useState(0)

  // WebRTC refs for voice
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const localStreamRef = useRef(null)

  // Load latest uploaded PDF from Supabase
  useEffect(() => {
    async function fetchLatestPdf() {
      try {
        const res = await fetch('/api/pdfs/latest')
        if (!res.ok) throw new Error('No PDF found')
        const data = await res.json()
        setPdfUrl(data.url)
        const offset = parseInt(data.pageOffset) || 0
        setPageOffset(offset)
      } catch (e) {
        console.error('No PDF loaded', e)
        setPdfUrl(null)
        setPageOffset(0)
      }
    }
    fetchLatestPdf()
  }, [])

  const openPdfAt = ({ page, highlights = [] }) => {
    const actualPage = parseInt(page) + parseInt(pageOffset)
    setPageNumber(actualPage)
    setHighlightPhrases(highlights)
    setShowViewer(true)
  }

  // Handle search results from Realtime API
  const handleSearchResult = (sections) => {
    if (!sections || sections.length === 0) {
      setResult({ selection: null, alternatives: [] })
      return
    }

    const results = sections.map((section, idx) => ({
      id: section.section,
      title: section.title,
      page: section.page,
      score: idx === 0 ? 1.0 : 0.8 - (idx * 0.1)
    }))

    const resultData = {
      selection: results[0],
      alternatives: results.slice(1),
      autoOpen: true,
      meta: { top: results[0]?.score || 0 }
    }

    setResult(resultData)
    if (resultData.selection && resultData.autoOpen) {
      openPdfAt({ page: resultData.selection.page, highlights: [query] })
    }
  }

  // Start voice session
  const startVoice = async () => {
    if (isListening) {
      stopVoice()
      return
    }

    try {
      setIsListening(true)
      setVoiceStatus('Getting microphone...')
      
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      localStreamRef.current = localStream
      
      setVoiceStatus('Connecting...')
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc
      
      const audioTrack = localStream.getAudioTracks()[0]
      pc.addTrack(audioTrack, localStream)
      
      // Handle audio response from AI (silent mode)
      pc.ontrack = (event) => {
        // We receive audio but don't play it (silent assistant)
        console.log('Received audio track (muted)')
      }
      
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      
      dc.onopen = () => {
        console.log('Data channel opened')
        setVoiceStatus('Listening - just speak!')
        
        // Configure the session with your TOC
        const sessionConfig = {
          type: "session.update",
          session: {
            modalities: ["audio", "text"],
            voice: "alloy",
            input_audio_transcription: {
              model: "whisper-1"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            },
            instructions: `You are a silent search assistant for electricians using AS/NZS 3000:2018.
            
            CRITICAL: You NEVER speak responses aloud. You only return function calls.
            
            When users ask questions:
            1. Search the TOC for matching sections
            2. Use the search_sections function to return results
            3. DO NOT generate any audio response
            
            Understand electrician terminology:
            - "switchie" or "board" = switchboard
            - "RCD" or "safety switch" = residual current device  
            - "EFLI" = earth fault loop impedance
            - "max demand" = maximum demand
            - Common phrases like "where do I put" = location requirements
            
            Handle navigation commands:
            - "next page" or "forward" = use navigate_page with direction: "next"
            - "previous" or "back" = use navigate_page with direction: "prev"
            - "page 317" = use navigate_page with page: 317
            
            Here is the table of contents:
            ${AS_NZS_3000_TOC.map(e => `${e.section}: ${e.title} (Page ${e.page})`).join('\n')}`,
            
            tools: [
              {
                type: "function",
                name: "search_sections",
                description: "Return matching sections from the TOC",
                parameters: {
                  type: "object",
                  properties: {
                    sections: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          section: { type: "string" },
                          title: { type: "string" },
                          page: { type: "number" }
                        }
                      },
                      description: "Array of matching sections (max 6)"
                    }
                  },
                  required: ["sections"]
                }
              },
              {
                type: "function",
                name: "navigate_page",
                description: "Navigate the PDF viewer",
                parameters: {
                  type: "object",
                  properties: {
                    direction: {
                      type: "string",
                      enum: ["next", "prev"],
                      description: "Navigation direction"
                    },
                    page: {
                      type: "number",
                      description: "Specific page number to go to"
                    }
                  }
                }
              }
            ]
          }
        }
        
        dc.send(JSON.stringify(sessionConfig))
      }
      
      dc.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        console.log('Realtime message:', msg.type) // Debug log
        
        // Handle audio transcription events
        if (msg.type === 'input_audio_buffer.speech_started') {
          setQuery('') // Clear when new speech starts
          setVoiceStatus('Listening...')
        }
        
        if (msg.type === 'input_audio_buffer.speech_stopped') {
          setVoiceStatus('Processing...')
        }
        
        // Handle partial transcription updates (real-time text as you speak)
        if (msg.type === 'conversation.item.input_audio_transcription.delta') {
          if (msg.delta) {
            setQuery(prev => prev + msg.delta)
          }
        }
        
        // Handle completed transcription
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          if (msg.transcript) {
            setQuery(msg.transcript)
            setVoiceStatus('Searching...')
          }
        }
        
        // Handle function calls
        if (msg.type === 'response.function_call_arguments.done') {
          if (msg.name === 'search_sections') {
            try {
              const args = JSON.parse(msg.arguments)
              handleSearchResult(args.sections)
              setVoiceStatus('Listening')
              
              // Send silent acknowledgment
              dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: msg.call_id,
                  output: 'done'
                }
              }))
            } catch (e) {
              console.error('Error parsing search results:', e)
            }
          } else if (msg.name === 'navigate_page') {
            try {
              const args = JSON.parse(msg.arguments)
              
              if (args.direction === 'next') {
                setPageNumber(prev => prev + 1)
              } else if (args.direction === 'prev') {
                setPageNumber(prev => Math.max(1, prev - 1))
              } else if (args.page) {
                openPdfAt({ page: args.page, highlights: [] })
              }
              
              dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: msg.call_id,
                  output: 'done'
                }
              }))
            } catch (e) {
              console.error('Error navigating:', e)
            }
          }
        }
      }
      
      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      // Wait for ICE gathering
      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') resolve()
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') resolve()
        }
        setTimeout(resolve, 2000)
      })
      
      // Send to API
      const response = await fetch('/api/realtime-regs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: pc.localDescription.sdp })
      })
      
      if (!response.ok) {
        throw new Error('Failed to connect to Realtime API')
      }
      
      const { sdp: answer } = await response.json()
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })
      
      console.log('Voice connection established')
      
    } catch (error) {
      console.error('Voice error:', error)
      setError('Voice connection failed')
      stopVoice()
    }
  }

  const stopVoice = () => {
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }
    
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    
    setIsListening(false)
    setVoiceStatus('')
  }

  // Handle text search through Realtime data channel
  const runSearch = async () => {
    if (!query.trim()) return
    
    setLoading(true)
    setError(null)
    
    // If voice is active, send through data channel
    if (dcRef.current && dcRef.current.readyState === 'open') {
      dcRef.current.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{
            type: 'input_text',
            text: query
          }]
        }
      }))
      
      // Trigger response
      dcRef.current.send(JSON.stringify({ type: 'response.create' }))
      setLoading(false)
    } else {
      // Fallback to simple search if voice not active
      try {
        const res = await fetch('/api/search-toc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        })
        if (!res.ok) throw new Error('Search failed')
        const data = await res.json()
        setResult(data)
        if (data.selection && data.autoOpen) {
          openPdfAt({ page: data.selection.page, highlights: [query] })
        }
      } catch (e) {
        console.error(e)
        setError('Search failed. Try enabling voice mode.')
      } finally {
        setLoading(false)
      }
    }
  }

  const onAltClick = (alt) => openPdfAt({ page: alt.page, highlights: [query] })

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoice()
    }
  }, [])

  return (
    <div className="min-h-dvh bg-neutral-950 text-white flex flex-col items-center p-4">
      <div className="w-full max-w-md mt-12">
        {/* Center mic/icon button */}
        <button
          className={`mx-auto block h-20 w-20 rounded-full backdrop-blur active:scale-95 transition ${
            isListening 
              ? 'bg-red-500/20 hover:bg-red-500/30 animate-pulse' 
              : 'bg-white/10 hover:bg-white/15'
          }`}
          onClick={isListening ? stopVoice : startVoice}
          disabled={!pdfUrl}
          aria-label="Voice Search"
        >
          <span className="text-3xl">{isListening ? '🔴' : '🎤'}</span>
        </button>

        {voiceStatus && (
          <div className="mt-2 text-xs text-white/60 text-center">{voiceStatus}</div>
        )}

        {!pdfUrl && (
          <div className="mt-4 text-sm text-white/60 text-center">Upload a PDF first to start searching.</div>
        )}

        {/* Text input for typed queries */}
        <div className="mt-6">
          <input
            className="w-full rounded-xl bg-white/10 px-4 py-3 outline-none placeholder-white/40"
            placeholder={isListening ? "Listening... or type here" : "Ask anything about the regs…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            disabled={!pdfUrl}
          />
        </div>

        {loading && <div className="mt-6 text-center text-white/60">Thinking…</div>}

        {error && <div className="mt-6 text-sm text-red-300">{error}</div>}

        {result && (
          <div className="mt-8 space-y-4">
            {result.selection && (
              <div className="rounded-xl border border-white/10 p-4 bg-white/5">
                <div className="text-sm text-white/70">Top match</div>
                <div className="mt-1 font-medium">{result.selection.id} — {result.selection.title}</div>
                <div className="text-white/70 text-sm">Page {result.selection.page} • score {result.meta?.top?.toFixed?.(2)}</div>
                {result.autoOpen ? (
                  <div className="mt-2 text-xs text-white/60">Opened in viewer automatically.</div>
                ) : (
                  <div className="mt-3">
                    <button onClick={() => onAltClick(result.selection)} className="text-sm underline">Open page</button>
                  </div>
                )}
              </div>
            )}

            {result.alternatives?.length > 0 && (
              <div className="rounded-xl border border-white/10 p-4 bg-white/5">
                <div className="text-sm text-white/70">Other likely sections</div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {result.alternatives.map((a, i) => (
                    <button key={i}
                      onClick={() => onAltClick(a)}
                      className="text-left rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2"
                    >
                      <div className="font-medium">{a.id} — {a.title}</div>
                      <div className="text-white/60 text-sm">Page {a.page} • score {a.score.toFixed(2)}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {result.rephrases?.length > 0 && (
              <div className="rounded-xl border border-white/10 p-4 bg-white/5">
                <div className="text-sm text-white/70">Try asking:</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.rephrases.slice(0,3).map((r, i) => (
                    <button key={i}
                      onClick={() => { setQuery(r); runSearch() }}
                      className="rounded-full bg-white/10 hover:bg-white/15 px-3 py-1 text-sm"
                    >{r}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showViewer && pdfUrl && (
        <PDFViewer
          url={pdfUrl}
          pageNumber={pageNumber}
          onClose={() => setShowViewer(false)}
          onPageChange={setPageNumber}
          highlightPhrases={highlightPhrases}
        />
      )}
    </div>
  )
}