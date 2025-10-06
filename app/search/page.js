'use client'

import { useState, useEffect, useRef } from 'react'
import PDFViewer from '../../components/PDFViewer'

// --- Icon components ---
const BoltIcon = ({ className = '', color = 'currentColor' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill={color} />
  </svg>
)

const LogoRounded = ({ className = '', corner = 6 }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <rect x="0" y="0" width="24" height="24" rx={corner} fill="#FACC15" />
    <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill="#0B0F19" />
  </svg>
)

const AudioBars = ({ active = false }) => {
  if (!active) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bars">
        <span style={{ animationDelay: '0ms' }} />
        <span style={{ animationDelay: '120ms' }} />
        <span style={{ animationDelay: '240ms' }} />
        <span style={{ animationDelay: '360ms' }} />
      </div>
      <style jsx>{`
        .bars { display: grid; grid-auto-flow: column; gap: 6px; align-items: end; height: 28px; }
        .bars span { width: 4px; background: #FACC15; height: 10px; border-radius: 2px; animation: eq-bounce 900ms ease-in-out infinite; }
        @keyframes eq-bounce { 0%, 100% { height: 8px; opacity: .85; } 50% { height: 24px; opacity: 1; } }
      `}</style>
    </div>
  )
}

export default function SearchPage() {
  // Core state
  const [isListening, setIsListening] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  
  // PDF state
  const [showViewer, setShowViewer] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [alternativeMatches, setAlternativeMatches] = useState([])
  
  // Document state
  const [documents, setDocuments] = useState([])
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [tocEntries, setTocEntries] = useState([])
  const [pageOffset, setPageOffset] = useState(0)
  
  // WebRTC refs
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const localStreamRef = useRef(null)
  const pdfUrlRef = useRef(null)
  const documentsRef = useRef([])
  const selectedDocIdRef = useRef(null)
  const pageOffsetRef = useRef(0)

  useEffect(() => {
    loadDocuments()
  }, [])

  useEffect(() => {
    if (selectedDocId) {
      selectedDocIdRef.current = selectedDocId
      const selectedDoc = documents.find(d => d.id === selectedDocId)
      if (selectedDoc) {
        const offset = selectedDoc.pdf_page_offset || 0
        setPageOffset(offset)
        pageOffsetRef.current = offset
        
        Promise.all([
          loadPdfUrl(selectedDoc.filename),
          loadTocForDocument(selectedDocId)
        ]).then(([url]) => {
          if (url) {
            setPdfUrl(url)
            pdfUrlRef.current = url
          }
        })
      }
    }
  }, [selectedDocId, documents])

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/get-documents')
      const data = await response.json()
      
      if (data.error) throw new Error(data.error)
      
      setDocuments(data.documents || [])
      documentsRef.current = data.documents || []
      
      if (data.documents?.length > 0 && !selectedDocId) {
        setSelectedDocId(data.documents[0].id)
        selectedDocIdRef.current = data.documents[0].id
      }
    } catch (error) {
      console.error('Error loading documents:', error)
      setError(`Failed to load documents: ${error.message}`)
    }
  }

  const loadPdfUrl = async (filename) => {
    try {
      const response = await fetch(`/api/get-pdf-signed-url?filename=${filename}`)
      const data = await response.json()
      return data.url
    } catch (error) {
      console.error('Error getting PDF URL:', error)
      return null
    }
  }

  const loadTocForDocument = async (docId) => {
    try {
      const response = await fetch(`/api/get-toc?documentId=${docId}`)
      const data = await response.json()
      
      if (data.error) throw new Error(data.error)
      
      setTocEntries(data.toc || [])
    } catch (error) {
      console.error('Error loading TOC:', error)
      setError(`Failed to load table of contents: ${error.message}`)
    }
  }

  const startVoice = async () => {
    if (isListening) {
      stopVoice()
      return
    }

    if (!selectedDocId || tocEntries.length === 0) {
      setError('Please wait for the document to load')
      return
    }

    try {
      setIsListening(true)
      setVoiceStatus('Getting microphone...')
      setError(null)

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      localStreamRef.current = localStream

      if (pcRef.current && dcRef.current) {
        const audioTrack = localStream.getAudioTracks()[0]
        pcRef.current.addTrack(audioTrack, localStream)
        setVoiceStatus('Listening - just speak!')
        return
      }

      await startConnection(localStream)
      setVoiceStatus('Listening - just speak!')

    } catch (error) {
      console.error('Voice error:', error)
      setError('Microphone access denied or unavailable')
      setIsListening(false)
      setVoiceStatus('')
    }
  }

  const startConnection = async (localStream = null) => {
    try {
      setVoiceStatus('Connecting...')

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc

      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        pc.addTrack(audioTrack, localStream)
      }

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const audio = new Audio()
          audio.srcObject = event.streams[0]
          audio.autoplay = true
        }
      }

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        setVoiceStatus(localStream ? 'Listening - just speak!' : 'Ready - type or speak!')
        setIsConnected(true)

        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['audio', 'text'],
            voice: 'alloy',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            },
            instructions: `Search this table of contents for the best matching clause:

${tocEntries.map(e => `${e.section_number}: ${e.title} (Page ${e.document_page || e.page})`).join('\n')}

For each question:
1. Find the most specific matching clause
2. Include up to 3 alternatives if relevant
3. Call find_section function
4. After function returns, say: "Look at Clause [number]"

If nothing matches, use section_number "NO_MATCH" and say "Sorry, I can't find that."`,
            tools: [
              {
                type: 'function',
                name: 'find_section',
                description: 'Navigate PDF to specific clause and show alternatives',
                parameters: {
                  type: 'object',
                  properties: {
                    section_number: { 
                      type: 'string',
                      description: 'Best match clause number from TOC, or "NO_MATCH" if nothing found'
                    },
                    title: { 
                      type: 'string',
                      description: 'Best match clause title from TOC, or empty if NO_MATCH'
                    },
                    page: { 
                      type: 'number',
                      description: 'Best match page number from TOC, or 0 if NO_MATCH'
                    },
                    alternatives: {
                      type: 'array',
                      description: 'Up to 3 alternative matches if they exist',
                      items: {
                        type: 'object',
                        properties: {
                          section_number: { type: 'string' },
                          title: { type: 'string' },
                          page: { type: 'number' }
                        }
                      }
                    }
                  },
                  required: ['section_number', 'title', 'page']
                }
              }
            ]
          }
        }

        dc.send(JSON.stringify(sessionConfig))
      }

      dc.onmessage = async (event) => {
        const msg = JSON.parse(event.data)
        
        console.log('📨 Received:', msg.type, msg)
        
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          if (msg.transcript) {
            setQuery(msg.transcript)
            setVoiceStatus('Processing...')
          }
        }

        if (msg.type === 'input_audio_buffer.speech_started') {
          setQuery('')
          setVoiceStatus('Listening...')
          setError(null)
        }

        if (msg.type === 'response.function_call_arguments.done' && msg.name === 'find_section') {
          try {
            const args = JSON.parse(msg.arguments)
            console.log('🔍 Function called with:', args)
            
            if (args.section_number === 'NO_MATCH') {
              console.log('❌ No match found')
              setAlternativeMatches([])
              
              dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: msg.call_id,
                  output: 'NO_MATCH'
                }
              }))
              
              dc.send(JSON.stringify({ 
                type: 'response.create',
                response: {
                  modalities: ['audio', 'text'],
                  instructions: 'Say: "Sorry, I can\'t find that. Please rephrase your question."'
                }
              }))
              
              setVoiceStatus('No match - try rephrasing')
              setTimeout(() => setVoiceStatus('Ready - ask another question!'), 2000)
              return
            }
            
            console.log('🔍 Opening clause:', args.section_number, 'at page', args.page)
            setVoiceStatus('Opening PDF...')
            
            if (!args.page || isNaN(args.page)) {
              throw new Error('Invalid page number')
            }
            
            if (args.alternatives && args.alternatives.length > 0) {
              console.log('📚 Found', args.alternatives.length, 'alternative matches')
              setAlternativeMatches(args.alternatives)
            } else {
              setAlternativeMatches([])
            }
            
            if (!pdfUrlRef.current) {
              const selectedDoc = documentsRef.current.find(d => d.id === selectedDocIdRef.current)
              if (selectedDoc) {
                const url = await loadPdfUrl(selectedDoc.filename)
                if (url) {
                  setPdfUrl(url)
                  pdfUrlRef.current = url
                } else {
                  throw new Error('Failed to load PDF')
                }
              }
            }
            
            const actualPage = parseInt(args.page) + (pageOffsetRef.current || 0)
            console.log(`📄 Navigation: Doc page ${args.page} + offset ${pageOffsetRef.current} = PDF page ${actualPage}`)
            
            setPageNumber(actualPage)
            if (!showViewer) {
              setShowViewer(true)
            }
            
            await new Promise(resolve => setTimeout(resolve, 300))
            
            console.log('✅ PDF opened successfully')
            
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: args.section_number
              }
            }))
            
            dc.send(JSON.stringify({ 
              type: 'response.create',
              response: {
                modalities: ['audio', 'text'],
                instructions: 'Say "Look at Clause" followed by the clause number from the function output. Be brief and clear.'
              }
            }))
            
            // Don't set status yet - wait for audio to finish
            
          } catch (e) {
            console.error('❌ PDF Error:', e)
            setError(`Failed to open PDF: ${e.message}`)
            setAlternativeMatches([])
            
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: 'ERROR: Could not open PDF. Please try again.'
              }
            }))
            dc.send(JSON.stringify({ type: 'response.create' }))
            
            setTimeout(() => setVoiceStatus('Ready - try again'), 1500)
          }
        }

        if (msg.type === 'error') {
          console.error('🚨 API Error:', msg.error)
          setError(`Voice error: ${msg.error?.message || 'Unknown error'}`)
          setVoiceStatus('Error occurred - try again')
        }

        if (msg.type === 'response.done') {
          console.log('✓ Response complete')
        }

        // Wait for audio to finish before saying "ready"
        if (msg.type === 'output_audio_buffer.stopped' || msg.type === 'response.content_part.done') {
          setVoiceStatus('Ready - ask another question!')
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') resolve()
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') resolve()
        }
        setTimeout(resolve, 2000)
      })

      const response = await fetch('/api/realtime-regs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: pc.localDescription.sdp })
      })

      if (!response.ok) throw new Error('Failed to connect')

      const { sdp: answer } = await response.json()
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })

    } catch (error) {
      console.error('Connection error:', error)
      setError('Connection failed')
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
    setIsConnected(false)
    setVoiceStatus('')
  }

  const handleTextQuery = async (text) => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      setError('Connection not ready. Please tap the voice button first.')
      return
    }

    console.log('📝 Sending text query:', text)
    setQuery(text)
    setVoiceStatus('Processing...')

    dcRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: text
        }]
      }
    }))

    dcRef.current.send(JSON.stringify({
      type: 'response.create'
    }))
  }

  useEffect(() => () => stopVoice(), [])

  return (
    <div className="relative min-h-dvh bg-neutral-950 text-white flex flex-col items-center p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 24px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 24px)
          `
        }}
      />

      <header className="relative z-10 w-full max-w-md mt-6 mb-4">
        <div className="flex items-center gap-3">
          <LogoRounded className="h-8 w-8" />
          <h1 className="text-base font-semibold tracking-tight">AskRegs</h1>
        </div>
      </header>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6">
          <select
            value={selectedDocId || ''}
            onChange={(e) => {
              const newId = Number(e.target.value)
              setSelectedDocId(newId)
              selectedDocIdRef.current = newId
            }}
            className="w-full rounded-xl bg-white/10 px-4 py-2 outline-none text-white"
            style={{ background: 'rgba(255,255,255,0.1)' }}
          >
            <option value="" disabled>Select a document</option>
            {documents.map(doc => (
              <option key={doc.id} value={doc.id} style={{ background: '#0B0F19' }}>
                {doc.title || doc.filename}
              </option>
            ))}
          </select>
          {selectedDocId && (
            <div className="mt-2 text-xs text-white/60">
              {tocEntries.length > 0 
                ? `📚 ${tocEntries.length} sections loaded` 
                : 'Loading table of contents...'}
            </div>
          )}
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <button
              className={`relative h-16 w-16 rounded-xl ring-2 backdrop-blur active:scale-95 transition flex-shrink-0
                ${isListening ? 'ring-yellow-400 bg-yellow-400/10' : 'ring-yellow-400/70 bg-white/10 hover:bg-white/15'}`}
              onClick={startVoice}
              disabled={!selectedDocId || tocEntries.length === 0}
              aria-label="Tap to talk"
            >
              <div className="flex items-center justify-center h-full relative">
                {isListening ? (
                  <AudioBars active />
                ) : (
                  <BoltIcon className="h-7 w-7" color="#FACC15" />
                )}
              </div>
            </button>

            {isConnected ? (
              <div className="flex-1">
                {query ? (
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-xs text-white/60 mb-1">You asked:</div>
                    <div className="text-sm">{query}</div>
                  </div>
                ) : (
                  <form onSubmit={(e) => {
                    e.preventDefault()
                    const input = e.target.querySelector('input')
                    if (input.value.trim()) {
                      handleTextQuery(input.value.trim())
                      input.value = ''
                    }
                  }} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type your question or use voice..."
                      className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 outline-none focus:border-yellow-400/50"
                    />
                    <button
                      type="submit"
                      className="px-5 py-3 bg-yellow-400/20 hover:bg-yellow-400/30 border border-yellow-400/30 rounded-xl text-yellow-400 text-sm font-medium transition"
                    >
                      Ask
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="flex-1">
                <div className="text-sm text-white/60">
                  Tap the voice button to start
                </div>
              </div>
            )}
          </div>

          {voiceStatus && (
            <div className="text-xs text-white/60 text-center">{voiceStatus}</div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="text-sm text-red-400">{error}</div>
          </div>
        )}
      </div>

      {showViewer && pdfUrl && (
        <PDFViewer
          url={pdfUrl}
          pageNumber={pageNumber}
          onClose={() => {
            setShowViewer(false)
            setAlternativeMatches([])
          }}
          onPageChange={setPageNumber}
          alternativeMatches={alternativeMatches}
          onAlternativeClick={(alt) => {
            const altPage = parseInt(alt.page) + (pageOffsetRef.current || 0)
            console.log(`📄 Navigating to alternative: ${alt.section_number} at page ${altPage}`)
            setPageNumber(altPage)
          }}
          isListening={isListening}
          voiceStatus={voiceStatus}
          query={query}
          onVoiceClick={startVoice}
          onTextQuery={handleTextQuery}
        />
      )}
    </div>
  )
}