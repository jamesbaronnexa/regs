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

const Spinner = ({ className = '', color = '#FACC15' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none">
    <circle 
      cx="12" 
      cy="12" 
      r="10" 
      stroke={color} 
      strokeWidth="3" 
      strokeLinecap="round"
      strokeDasharray="60"
      strokeDashoffset="40"
      opacity="0.25"
    />
    <circle 
      cx="12" 
      cy="12" 
      r="10" 
      stroke={color} 
      strokeWidth="3" 
      strokeLinecap="round"
      strokeDasharray="60"
      strokeDashoffset="40"
      className="animate-spin origin-center"
      style={{ animationDuration: '1s' }}
    />
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
  // Disable zoom and page movement on mobile
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]')
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    } else {
      const meta = document.createElement('meta')
      meta.name = 'viewport'
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
      document.head.appendChild(meta)
    }
    
    // Prevent double-tap zoom
    let lastTouchEnd = 0
    const preventZoom = (e) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }
    
    document.addEventListener('touchend', preventZoom, { passive: false })
    
    return () => {
      document.removeEventListener('touchend', preventZoom)
    }
  }, [])
  

  // Core state
  const [isListening, setIsListening] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [conversationState, setConversationState] = useState('idle')
  const [voiceStatus, setVoiceStatus] = useState('Tap to talk')
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  
  // PDF state
  const [showViewer, setShowViewer] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [alternativeMatches, setAlternativeMatches] = useState([])
  const [currentSection, setCurrentSection] = useState(null)
  
  // Document state
  const [documents, setDocuments] = useState([])
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [tocEntries, setTocEntries] = useState([])
  const [pageOffset, setPageOffset] = useState(0)
  const [isLoadingDocument, setIsLoadingDocument] = useState(false)
  
  // WebRTC refs
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const localStreamRef = useRef(null)
  const pdfUrlRef = useRef(null)
  const documentsRef = useRef([])
  const selectedDocIdRef = useRef(null)
  const pageOffsetRef = useRef(0)
  const timeoutRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const querySequenceRef = useRef(0)
  const pendingQueriesRef = useRef([])

  const remoteAudioRef = useRef(null)

  useEffect(() => {
    if (!remoteAudioRef.current) {
      const a = new Audio()
      a.autoplay = true
      a.playsInline = true
      remoteAudioRef.current = a
    }
  }, [])

  useEffect(() => {
    loadDocuments()
    
    // Hide loading screen after 1.5 seconds minimum
    setTimeout(() => {
      setIsInitialLoading(false)
    }, 1500)
  }, [])

  useEffect(() => {
    if (selectedDocId) {
      setShowViewer(false)
      setCurrentSection(null)
      setAlternativeMatches([])
      setQuery('')
      setPageNumber(1)
      setPdfUrl(null)
      pdfUrlRef.current = null
      selectedDocIdRef.current = selectedDocId
      setIsLoadingDocument(true)

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
          setIsLoadingDocument(false)
          setVoiceStatus('Tap to talk')
        }).catch(() => {
          setIsLoadingDocument(false)
          setVoiceStatus('Tap to talk')
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
      
      if (!response.ok) {
        const text = await response.text()
        console.error('API response not OK:', response.status, text)
        throw new Error(`API error: ${response.status} - ${text}`)
      }
      
      const data = await response.json()
      
      if (data.error) throw new Error(data.error)
      
      setTocEntries(data.toc || [])
      console.log(`✅ Loaded ${data.toc?.length || 0} TOC entries for document ${docId}`)
    } catch (error) {
      console.error('Error loading TOC:', error)
      setError(`Failed to load table of contents: ${error.message}`)
    }
  }

  const logQuery = async (queryData) => {
    try {
      await fetch('/api/log-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryData)
      })
    } catch (error) {
      console.error('Failed to log query:', error)
    }
  }

  const clearProcessingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  const startProcessingTimeout = () => {
    clearProcessingTimeout()
    timeoutRef.current = setTimeout(() => {
      setVoiceStatus('Taking longer than expected...')
      setTimeout(() => {
        if (conversationState !== 'speaking') {
          setVoiceStatus('Ready - try again')
          setConversationState('ready')
        }
      }, 2000)
    }, 10000)
  }

  const startVoice = async () => {
    if (isListening) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.enabled = false
        })
      }
      setIsListening(false)
      setVoiceStatus('Tap to talk')
      setConversationState('idle')
      return
    }

    if (!selectedDocId || tocEntries.length === 0) {
      setError('Please wait for the document to load')
      return
    }

    try {
      setIsListening(true)
      setVoiceStatus('Getting microphone...')
      setConversationState('connecting')
      setError(null)

      // Only request microphone if we don't already have it
      if (!localStreamRef.current) {
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        localStreamRef.current = localStream
      }

      // Reuse existing connection if available
      if (pcRef.current && dcRef.current && dcRef.current.readyState === 'open') {
        const audioTrack = localStreamRef.current.getAudioTracks()[0]
        audioTrack.enabled = true
        setVoiceStatus('Listening - just speak!')
        setConversationState('ready')
        return
      }

      // Enable the track for new connection
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      audioTrack.enabled = true

      await startConnection()
      setVoiceStatus('Listening - just speak!')
      setConversationState('ready')

    } catch (error) {
      console.error('Voice error:', error)
      setError('Microphone access denied or unavailable')
      setIsListening(false)
      setVoiceStatus('Tap to talk')
      setConversationState('idle')
    }
  }

  const startConnection = async () => {
    try {
      setVoiceStatus('Connecting...')
      setConversationState('connecting')

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc

      // Add the existing audio track from localStreamRef
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0]
        pc.addTrack(audioTrack, localStreamRef.current)
      }

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0] && remoteAudioRef.current) {
          remoteAudioRef.current.volume = 0
          remoteAudioRef.current.srcObject = event.streams[0]
          setTimeout(() => { remoteAudioRef.current.volume = 1 }, 200)
        }
      }

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onclose = () => {
        console.log('Data channel closed')
        setIsConnected(false)
        setIsListening(false)
        setVoiceStatus('Tap to talk')
        setConversationState('idle')
      }

      dc.onopen = () => {
        reconnectAttemptRef.current = 0
        setVoiceStatus('Listening - just speak!')
        setIsConnected(true)
        setConversationState('ready')

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
              prefix_padding_ms: 500,
              silence_duration_ms: 1000
            },
            instructions: `You are a PDF search assistant for regulations.

When the user asks a question:
1. FIRST call search_toc with their query to find relevant sections
2. THEN call find_section with the BEST match from the search results

IMPORTANT RULES:
- If the query is about a DIFFERENT topic than the last result, ALWAYS do a fresh search
- If the query is a FOLLOW-UP question (like "what's the maximum?" or "tell me more"), you can reference the current section
- When in doubt, do a fresh search - it's fast!

Be concise and helpful. If no matches found, say: "I couldn't find that in this regulation."`,
            tools: [
              {
                type: 'function',
                name: 'search_toc',
                description: 'Search the table of contents for relevant sections, tables, figures, or clauses',
                parameters: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'The user\'s search query - extract key terms like section numbers, topics, or keywords'
                    }
                  },
                  required: ['query']
                }
              },
              {
                type: 'function',
                name: 'find_section',
                description: 'Navigate PDF to a specific section after searching',
                parameters: {
                  type: 'object',
                  properties: {
                    section_number: { 
                      type: 'string',
                      description: 'Section number from search results, or "NO_MATCH" if nothing found'
                    },
                    title: { 
                      type: 'string',
                      description: 'Section title from search results, or empty if NO_MATCH'
                    },
                    page: { 
                      type: 'number',
                      description: 'Page number from search results, or 0 if NO_MATCH'
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
            setConversationState('processing')
            startProcessingTimeout()
            
            const seq = querySequenceRef.current++
            const queryId = `voice_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            
            pendingQueriesRef.current.push({
              seq,
              queryId,
              text: msg.transcript
            })
            
            console.log(`📋 Query #${seq} logged: "${msg.transcript}"`)
          }
        }

        if (msg.type === 'input_audio_buffer.speech_started') {
          setQuery('')
          setAlternativeMatches([])
          setCurrentSection(null)
          setVoiceStatus('Listening...')
          setConversationState('listening')
          setError(null)
          clearProcessingTimeout()
          
          window._lastSearchAlternatives = []
          
          console.log('🧹 New query detected - clearing previous context')
        }

        if (msg.type === 'input_audio_buffer.speech_stopped') {
          setVoiceStatus('Processing...')
          setConversationState('processing')
        }

        if (msg.type === 'response.audio.delta' || msg.type === 'response.audio_transcript.delta') {
          setVoiceStatus('🔊 Speaking...')
          setConversationState('speaking')
          clearProcessingTimeout()
        }

        if (msg.type === 'response.audio.done' || msg.type === 'response.content_part.done') {
          setConversationState('ready')
          setVoiceStatus('Tap to ask again')
          clearProcessingTimeout()
          if (localStreamRef.current) {
            console.log('🎤 Muting microphone after audio done')
            localStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = false
            })
            setIsListening(false)
            setConversationState('idle')
            setVoiceStatus('Tap to talk')
          }
        }

        if (msg.type === 'response.function_call_arguments.done' && msg.name === 'search_toc') {
          try {
            const args = JSON.parse(msg.arguments)
            console.log('🔍 Searching TOC for:', args.query)
            
            setVoiceStatus('Searching document...')
            
            const response = await fetch('/api/search-toc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                documentId: selectedDocIdRef.current,
                query: args.query
              })
            })
            
            const { results, topAlternatives } = await response.json()
            
            console.log(`✅ Found ${results?.length || 0} matches`)
            
            if (topAlternatives && topAlternatives.length > 0) {
              window._lastSearchAlternatives = topAlternatives
              console.log('📚 Stored alternatives:', topAlternatives)
            } else {
              window._lastSearchAlternatives = []
            }
            
            const formattedResults = results && results.length > 0
              ? results.map(r => 
                  `${r.section_number}: ${r.title} (Page ${r.document_page || r.page})`
                ).join('\n')
              : 'No matches found'
            
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: formattedResults
              }
            }))
            
            dc.send(JSON.stringify({ type: 'response.create' }))
            
          } catch (e) {
            console.error('❌ Search error:', e)
            window._lastSearchAlternatives = []
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: 'Search error - please try again'
              }
            }))
            dc.send(JSON.stringify({ type: 'response.create' }))
          }
        }

        if (msg.type === 'response.function_call_arguments.done' && msg.name === 'find_section') {
          try {
            const args = JSON.parse(msg.arguments)
            console.log('📖 Function called with:', args)
            
            const pendingQuery = pendingQueriesRef.current.shift()
            if (pendingQuery) {
              console.log(`✅ Logging complete query for #${pendingQuery.seq}: "${pendingQuery.text}"`)
  
              logQuery({
                query_id: pendingQuery.queryId,
                query_text: pendingQuery.text,
                query_type: 'voice',
                document_id: selectedDocIdRef.current,
                timestamp: new Date().toISOString(),
                result_section: args.section_number,
                result_title: args.title || '',
                result_page: args.page || 0,
                result_found: args.section_number !== 'NO_MATCH',
                alternatives_count: (args.alternatives || window._lastSearchAlternatives || []).length
              })
            } else {
              console.warn('⚠️ No pending query found for result')
            }
            
            if (args.section_number === 'NO_MATCH') {
              console.log('❌ No match found')
              setAlternativeMatches([])
              setCurrentSection(null)
              
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
                  instructions: 'Say: "I couldn\'t find that in this document. Could you try rephrasing or asking about something else?"'
                }
              }))
              
              setVoiceStatus('No match found')
              setTimeout(() => {
                if (localStreamRef.current) {
                  console.log('🎤 Muting microphone after no match')
                  localStreamRef.current.getAudioTracks().forEach(track => {
                    track.enabled = false
                  })
                  setIsListening(false)
                  setVoiceStatus('Tap to talk')
                  setConversationState('idle')
                }
              }, 2000)
              return
            }
            
            console.log('📖 Opening section:', args.section_number, 'at page', args.page)
            setVoiceStatus('Opening PDF...')
            
            if (!args.page || isNaN(args.page)) {
              throw new Error('Invalid page number')
            }
            
            const alternatives = args.alternatives || window._lastSearchAlternatives || []
            
            if (alternatives && alternatives.length > 0) {
              console.log('📚 Showing', alternatives.length, 'alternative matches')
              setAlternativeMatches(alternatives)
            } else {
              console.log('ℹ️ No alternatives available')
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
            
            setCurrentSection({
              section_number: args.section_number,
              title: args.title
            })
            
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
                instructions: `The PDF is now showing ${args.section_number}: ${args.title}. Say ONLY "Look at ${args.section_number}" - use the NEW section number I just gave you, not any previous one.`
              }
            }))
            
            window._lastSearchAlternatives = []
            
          } catch (e) {
            console.error('❌ PDF Error:', e)
            setError(`Failed to open PDF: ${e.message}`)
            setAlternativeMatches([])
            setCurrentSection(null)
            
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: 'ERROR: Could not open PDF. Please try again.'
              }
            }))
            dc.send(JSON.stringify({ type: 'response.create' }))
            
            setTimeout(() => {
              if (localStreamRef.current) {
                console.log('🎤 Muting microphone after PDF error')
                localStreamRef.current.getAudioTracks().forEach(track => {
                  track.enabled = false
                })
                setIsListening(false)
                setVoiceStatus('Tap to talk')
                setConversationState('idle')
              }
            }, 2000)
          }
        }

        if (msg.type === 'error') {
          console.error('🚨 API Error:', msg.error)
          setError(`${msg.error?.message || 'Unknown error'}. Tap voice button to retry.`)
          setVoiceStatus('Tap to talk')
          setConversationState('idle')
          clearProcessingTimeout()
        }

        if (msg.type === 'response.done') {
          console.log('✓ Response complete')
          clearProcessingTimeout()
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
      setError('Connection failed. Please try again.')
      stopVoice()
    }
  }

  const stopVoice = () => {
    clearProcessingTimeout()
    
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
    setVoiceStatus('Tap to talk')
    setConversationState('idle')
    reconnectAttemptRef.current = 0
    pendingQueriesRef.current = []
  }

  const handleTextQuery = async (text) => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      setError('Connection not ready. Please tap the voice button first.')
      return
    }

    console.log('🔎 Sending text query:', text)
    setQuery(text)
    setVoiceStatus('Processing...')
    setConversationState('processing')
    setAlternativeMatches([])
    setCurrentSection(null)
    startProcessingTimeout()

    const seq = querySequenceRef.current++
    const queryId = `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    pendingQueriesRef.current.push({
      seq,
      queryId,
      text
    })
        
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

  useEffect(() => () => {
    stopVoice()
    clearProcessingTimeout()
  }, [])

  const currentDocTitle = selectedDocId 
    ? (documents.find(d => d.id === selectedDocId)?.title || 
       documents.find(d => d.id === selectedDocId)?.filename || 
       'Select a regulation')
    : 'Select a regulation'

  // Determine button state
  const isButtonDisabled = !selectedDocId || tocEntries.length === 0 || isLoadingDocument
  const isButtonConnecting = conversationState === 'connecting'
  const isButtonListening = conversationState === 'listening'
  const isButtonProcessing = conversationState === 'processing'
  const isButtonReady = !isButtonDisabled && (conversationState === 'idle' || conversationState === 'ready')

  return (
    <>
      {isInitialLoading && (
        <div className="fixed inset-0 bg-neutral-950 z-50 flex flex-col items-center justify-center gap-4">
          <LogoRounded className="h-24 w-24" />
          <h1 className="text-2xl font-bold tracking-tight text-white">Regs</h1>
        </div>
      )}

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
            <h1 className="text-base font-semibold tracking-tight">Regs</h1>
          </div>
        </header>

        <div className="relative z-10 w-full max-w-md">
          <div className="mb-6 p-5 rounded-2xl bg-neutral-900/80 border-2 border-yellow-400/60">
            {selectedDocId && (
              <>
                <div className="text-xs font-semibold text-yellow-400/90 uppercase tracking-wider mb-2">
                  Currently Searching
                </div>
                <div className="text-lg font-bold text-white mb-3">
                  {currentDocTitle}
                </div>
              </>
            )}
            
            <select
              value={selectedDocId || ''}
              onChange={async (e) => {
                const newId = Number(e.target.value)
                setSelectedDocId(newId)
                selectedDocIdRef.current = newId
                setVoiceStatus('Loading document...')
                stopVoice()
                setShowViewer(false)
                setCurrentSection(null)
                setAlternativeMatches([])
                setQuery('')
                setPageNumber(1)
                setPdfUrl(null)
                pdfUrlRef.current = null
                pendingQueriesRef.current = []
                clearProcessingTimeout()
              }}
              className="w-full rounded-xl bg-white/10 hover:bg-white/15 px-4 py-3 outline-none text-white font-medium transition cursor-pointer border border-white/20"
              disabled={isLoadingDocument}
            >
              <option value="" disabled style={{ background: '#0B0F19' }}>
                Choose a regulation to search
              </option>
              {documents.map(doc => (
                <option key={doc.id} value={doc.id} style={{ background: '#0B0F19' }}>
                  {doc.title || doc.filename}
                </option>
              ))}
            </select>
            
            <div className="mt-3 text-sm">
              {!selectedDocId ? (
                <span className="text-yellow-400/80">⚠️ Please select a regulation to begin</span>
              ) : isLoadingDocument ? (
                <span className="text-yellow-400/80">⏳ Loading document...</span>
              ) : tocEntries.length > 0 ? (
                <span className="text-green-400/90">✓ {tocEntries.length} sections ready</span>
              ) : (
                <span className="text-white/60">Loading table of contents...</span>
              )}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex flex-col items-center gap-4 mb-4">
              <button
                className={`relative h-24 w-24 rounded-2xl backdrop-blur transition-all
                  ${isButtonDisabled 
                    ? 'ring-4 ring-neutral-600/50 bg-neutral-800/50 cursor-not-allowed' 
                    : isButtonConnecting || isButtonProcessing
                    ? 'ring-4 ring-yellow-400/70 bg-yellow-400/10'
                    : isButtonListening
                    ? 'ring-4 ring-yellow-400 bg-yellow-400/10'
                    : 'ring-4 ring-yellow-400/70 bg-white/10 hover:bg-white/15 active:scale-95'
                  }`}
                onClick={startVoice}
                disabled={isButtonDisabled}
                aria-label="Tap to talk"
              >
                <div className="flex items-center justify-center h-full relative">
                  {isButtonDisabled ? (
                    <BoltIcon className="h-10 w-10" color="#737373" />
                  ) : isButtonConnecting || isButtonProcessing ? (
                    <Spinner className="h-10 w-10" color="#FACC15" />
                  ) : isButtonListening ? (
                    <AudioBars active />
                  ) : (
                    <BoltIcon className="h-10 w-10" color="#FACC15" />
                  )}
                </div>
              </button>

              {!selectedDocId ? null : isLoadingDocument ? (
                <div className="text-sm text-white/70 text-center">Loading document...</div>
              ) : voiceStatus && (
                <div className="text-sm text-white/70 text-center">{voiceStatus}</div>
              )}

              {query && (
                <div className="w-full p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-xs text-white/60 mb-1">You asked:</div>
                  <div className="text-sm">{query}</div>
                </div>
              )}
              
              {currentSection && (
                <div className="w-full p-4 rounded-xl bg-yellow-400/20 border-2 border-yellow-400/50">
                  <div className="text-xs text-yellow-400/80 mb-1 font-medium">Found:</div>
                  <div className="text-base font-semibold text-yellow-400">{currentSection.section_number}</div>
                  <div className="text-sm text-white/90 mt-1">{currentSection.title}</div>
                </div>
              )}
            </div>

            {isListening && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Or type your question here..."
                  className="flex-1 px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white text-base placeholder-white/40 outline-none focus:border-yellow-400/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target.value.trim()) {
                      handleTextQuery(e.target.value.trim())
                      e.target.value = ''
                    }
                  }}
                />
                <button
                  onClick={(e) => {
                    const input = e.target.previousElementSibling
                    if (input.value.trim()) {
                      handleTextQuery(input.value.trim())
                      input.value = ''
                    }
                  }}
                  className="px-6 py-4 bg-yellow-400/20 hover:bg-yellow-400/30 border border-yellow-400/30 rounded-xl text-yellow-400 text-base font-medium transition"
                >
                  Ask
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-sm text-red-400">{error}</div>
            </div>
          )}

          <div className="text-center">
            <a 
              href="/tools" 
              className="inline-block px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium transition"
            >
              Tools
            </a>
          </div>
        </div>

        {showViewer && pdfUrl && (
          <PDFViewer
            url={pdfUrl}
            pageNumber={pageNumber}
            onClose={() => {
              setShowViewer(false)
              setAlternativeMatches([])
              setCurrentSection(null)
            }}
            onPageChange={setPageNumber}
            alternativeMatches={alternativeMatches}
            onAlternativeClick={(alt) => {
              const altPage = parseInt(alt.page) + (pageOffsetRef.current || 0)
              console.log(`📄 Navigating to alternative: ${alt.section_number} at page ${altPage}`)
              setPageNumber(altPage)
              setCurrentSection({
                section_number: alt.section_number,
                title: alt.title
              })
            }}
            isListening={isListening}
            voiceStatus={voiceStatus}
            query={query}
            onVoiceClick={startVoice}
            onTextQuery={handleTextQuery}
          />
        )}
      </div>
    </>
  )
}