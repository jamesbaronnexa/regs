'use client'

import { useState, useEffect, useRef } from 'react'
import PDFViewer from '../../components/PDFViewer'

// --- Helper functions ---
const renderTOCLines = (list) => (Array.isArray(list) ? list : [])
  .map((e) => `${e.section_number || e.section}: ${e.title} (Page ${e.document_page || e.page})`).join('\n')

// --- Icon components (keep as is) ---
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
  // Core state - SIMPLIFIED
  const [query, setQuery] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('')
  const [error, setError] = useState(null)
  
  // PDF state
  const [showViewer, setShowViewer] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [pageOffset, setPageOffset] = useState(0)

  // Document state
  const [documents, setDocuments] = useState([])
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [tocEntries, setTocEntries] = useState([])

  // Current search result
  const [currentSection, setCurrentSection] = useState(null)
  const [aiResponse, setAiResponse] = useState('')

  // WebRTC refs
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const localStreamRef = useRef(null)
  const audioRef = useRef(null)

  // Load documents on mount
  useEffect(() => {
    loadDocuments()
  }, [])

  // Handle document selection
  useEffect(() => {
    if (selectedDocId) {
      const selectedDoc = documents.find(d => d.id === selectedDocId)
      if (selectedDoc) {
        setPageOffset(selectedDoc.pdf_page_offset || 0)
        
        Promise.all([
          loadPdfUrl(selectedDoc.filename),
          loadTocForDocument(selectedDocId)
        ]).then(([url]) => {
          if (url) setPdfUrl(url)
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
      
      if (data.documents?.length > 0 && !selectedDocId) {
        setSelectedDocId(data.documents[0].id)
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
      console.log('TOC loaded:', data.toc?.length, 'entries')
    } catch (error) {
      console.error('Error loading TOC:', error)
      setError(`Failed to load table of contents: ${error.message}`)
    }
  }

  const openPdfAt = (page) => {
    if (!page || isNaN(page) || !pdfUrl) {
      console.error('Cannot open PDF:', { page, hasPdfUrl: !!pdfUrl })
      return false
    }
    
    const actualPage = parseInt(page) + parseInt(pageOffset)
    console.log('Opening PDF at page:', actualPage)
    
    setPageNumber(actualPage)
    setShowViewer(true)
    return true
  }

  const fetchPageContent = async (tocPageNumber) => {
    try {
      const dbPageNumber = parseInt(tocPageNumber) + 8
      const pageRange = []
      
      // Get pages around the target
      for (let i = dbPageNumber - 2; i <= dbPageNumber + 10; i++) {
        if (i > 0) pageRange.push(i)
      }
      
      console.log('Fetching pages:', pageRange)
      
      const response = await fetch('/api/get-page-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageNumbers: pageRange,
          documentId: selectedDocId
        })
      })
      
      const data = await response.json()
      if (data.content && data.content.length > 0) {
        const combined = data.content
          .map(p => `[Page ${p.page - 8}]\n${p.content}`)
          .join('\n\n')
        return combined
      }
      return null
    } catch (error) {
      console.error('Failed to fetch page content:', error)
      return null
    }
  }

  const startVoice = async () => {
    if (isListening) {
      stopVoice()
      return
    }

    if (!selectedDocId || tocEntries.length === 0) {
      setError('Please wait for document to load')
      return
    }

    try {
      setIsListening(true)
      setVoiceStatus('Getting microphone...')
      setQuery('')
      setAiResponse('')
      setCurrentSection(null)

      // Get microphone
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      localStreamRef.current = localStream

      setVoiceStatus('Connecting...')

      // Setup WebRTC
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc

      const audioTrack = localStream.getAudioTracks()[0]
      pc.addTrack(audioTrack, localStream)

      // Handle incoming audio
      pc.ontrack = (event) => {
        if (event.streams?.[0]) {
          if (audioRef.current) {
            audioRef.current.srcObject = null
          }
          audioRef.current = new Audio()
          audioRef.current.srcObject = event.streams[0]
          audioRef.current.autoplay = true
          audioRef.current.volume = 1.0
        }
      }

      // Create data channel
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onopen = () => {
        setVoiceStatus('Listening - just speak!')
        
        // SIMPLIFIED INSTRUCTIONS - ONE CLEAR PATH
        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['audio', 'text'],
            voice: 'alloy',
            input_audio_transcription: { model: 'whisper-1' },
            output_audio_format: 'pcm16',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            },
            instructions: `You are a regulation assistant for AS/NZS 3000:2018.

CRITICAL RULE: You MUST ALWAYS call search_regulation for EVERY question about regulations.

Available sections:
${renderTOCLines(tocEntries)}

WORKFLOW - FOLLOW EXACTLY:
1. User asks about a regulation
2. IMMEDIATELY call search_regulation with the best matching section
3. Wait for the content
4. Give a SHORT answer (max 30 words) based on the content

DO NOT:
- Answer without calling the function first
- Make up information
- Give long explanations

ALWAYS:
- Call search_regulation for every regulation question
- Keep responses under 30 words
- Be direct and factual`,
            tools: [
              {
                type: 'function',
                name: 'search_regulation',
                description: 'MUST BE CALLED for every regulation question',
                parameters: {
                  type: 'object',
                  properties: {
                    section_number: { 
                      type: 'string',
                      description: 'Section number from TOC'
                    },
                    title: { 
                      type: 'string',
                      description: 'Section title'
                    },
                    page: { 
                      type: 'number',
                      description: 'Page number from TOC'
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
        
        // Capture user transcript
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          if (msg.transcript) {
            setQuery(msg.transcript)
            console.log('User said:', msg.transcript)
          }
        }

        // Status updates
        if (msg.type === 'input_audio_buffer.speech_started') {
          setVoiceStatus('Listening...')
          setQuery('')
          setAiResponse('')
        }

        if (msg.type === 'input_audio_buffer.speech_stopped') {
          setVoiceStatus('Processing...')
        }

        // Capture AI response
        if (msg.type === 'response.audio_transcript.delta') {
          if (msg.delta) {
            setAiResponse(prev => prev + msg.delta)
          }
        }

        if (msg.type === 'response.audio_transcript.done') {
          setVoiceStatus('Ready - ask another question!')
        }

        // HANDLE FUNCTION CALL - SIMPLIFIED
        if (msg.type === 'response.function_call_arguments.done') {
          if (msg.name === 'search_regulation') {
            try {
              const args = JSON.parse(msg.arguments)
              console.log('Searching for:', args)
              
              // Validate page number
              if (!args.page || isNaN(args.page)) {
                dc.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: msg.call_id,
                    output: 'Error: Could not find that section. Please try again.'
                  }
                }))
                dc.send(JSON.stringify({ type: 'response.create' }))
                return
              }
              
              // Update UI
              setCurrentSection({
                section: args.section_number,
                title: args.title,
                page: args.page
              })
              
              // Open PDF - ALWAYS
              const pdfOpened = openPdfAt(args.page)
              if (!pdfOpened) {
                console.error('Failed to open PDF')
              }
              
              // Get content
              setVoiceStatus('Reading regulation...')
              const content = await fetchPageContent(args.page)
              
              // Send response - SIMPLE AND CLEAR
              let response = content 
                ? `Found Section ${args.section_number}. Content:\n${content}\n\nGive a brief answer based on this content.`
                : `Opening Section ${args.section_number} on page ${args.page}.`
              
              dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: msg.call_id,
                  output: response
                }
              }))
              
              dc.send(JSON.stringify({ type: 'response.create' }))
              
            } catch (e) {
              console.error('Function call error:', e)
              dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: msg.call_id,
                  output: 'Error processing request. Please try again.'
                }
              }))
              dc.send(JSON.stringify({ type: 'response.create' }))
            }
          }
        }
      }

      // Setup WebRTC connection
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

      // Connect to server
      const response = await fetch('/api/realtime-regs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: pc.localDescription.sdp })
      })

      if (!response.ok) throw new Error('Failed to connect')

      const { sdp: answer } = await response.json()
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })

      console.log('Voice connection established')

    } catch (error) {
      console.error('Voice error:', error)
      setError('Voice connection failed: ' + error.message)
      stopVoice()
    }
  }

  const stopVoice = () => {
    // Clean up audio
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current = null
    }

    // Close connections
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }

    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    // Stop tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }

    setIsListening(false)
    setVoiceStatus('')
  }

  // Cleanup on unmount
  useEffect(() => () => stopVoice(), [])

  return (
    <div className="relative min-h-dvh bg-neutral-950 text-white flex flex-col items-center p-4">
      {/* Background grid */}
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

      {/* Header */}
      <header className="relative z-10 w-full max-w-md mt-6 mb-4">
        <div className="flex items-center gap-3">
          <LogoRounded className="h-8 w-8" />
          <h1 className="text-base font-semibold tracking-tight">AskRegs</h1>
        </div>
      </header>

      <div className="relative z-10 w-full max-w-md">
        {/* Document selector */}
        <div className="mb-6">
          <select
            value={selectedDocId || ''}
            onChange={(e) => setSelectedDocId(Number(e.target.value))}
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
                ? `📚 ${tocEntries.length} sections ready` 
                : 'Loading sections...'}
            </div>
          )}
        </div>

        {/* Talk button */}
        <div className="relative w-fit mx-auto mb-6">
          <button
            className={`relative block h-20 w-20 rounded-2xl ring-2 backdrop-blur active:scale-95 transition
              ${isListening ? 'ring-yellow-400 bg-yellow-400/10' : 'ring-yellow-400/70 bg-white/10 hover:bg-white/15'}`}
            onClick={isListening ? stopVoice : startVoice}
            disabled={!selectedDocId || tocEntries.length === 0}
          >
            <div className="flex items-center justify-center h-full relative">
              {isListening ? (
                <AudioBars active />
              ) : (
                <BoltIcon className="h-8 w-8" color="#FACC15" />
              )}
            </div>
          </button>
          {voiceStatus && (
            <div className="mt-2 text-xs text-white/60 text-center">{voiceStatus}</div>
          )}
        </div>

        {/* Query display */}
        {query && (
          <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/60 mb-1">You asked:</div>
            <div className="text-sm">{query}</div>
          </div>
        )}

        {/* Current section */}
        {currentSection && (
          <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-white/60 mb-1">Viewing:</div>
            <div className="text-sm font-medium">
              Section {currentSection.section}: {currentSection.title}
            </div>
            <div className="text-xs text-white/60">Page {currentSection.page}</div>
          </div>
        )}

        {/* AI Response */}
        {aiResponse && (
          <div className="p-4 rounded-xl border border-yellow-400/20 bg-yellow-400/5">
            <div className="text-xs text-yellow-400 mb-2">Answer</div>
            <div className="text-sm text-white/90">{aiResponse}</div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* PDF Viewer */}
      {showViewer && pdfUrl && (
        <PDFViewer
          url={pdfUrl}
          pageNumber={pageNumber}
          onClose={() => setShowViewer(false)}
          onPageChange={setPageNumber}
          highlightPhrases={currentSection ? [currentSection.section] : []}
        />
      )}
    </div>
  )
}