'use client'

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// Dynamically import PDFViewer to avoid SSR issues
const PDFViewer = dynamic(() => import('../../components/PDFViewer'), { ssr: false })

export default function ClaudeSearchPage() {
  const [documents, setDocuments] = useState([])
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showViewer, setShowViewer] = useState(false)
  const [pageNumber, setPageNumber] = useState(1)
  const [pdfUrl, setPdfUrl] = useState(null)
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  // Load documents on mount
  useEffect(() => {
    loadDocuments()
  }, [])

  // Load PDF when document selected
  useEffect(() => {
    if (selectedDocId) {
      const selectedDoc = documents.find(d => d.id === selectedDocId)
      if (selectedDoc?.filename) {
        loadPdfUrl(selectedDoc.filename)
      }
    }
  }, [selectedDocId, documents])

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/get-documents')
      const data = await response.json()
      if (data.error) throw new Error(data.error)
      setDocuments(data.documents || [])
      // Don't auto-select first document - let user choose
    } catch (error) {
      console.error('Error loading documents:', error)
      setError(`Failed to load documents: ${error.message}`)
    }
  }

  const loadPdfUrl = async (filename) => {
    try {
      const response = await fetch(`/api/get-pdf-signed-url?filename=${filename}`)
      const data = await response.json()
      
      if (data.url) {
        setPdfUrl(data.url)
      }
    } catch (error) {
      console.error('Error loading PDF:', error)
    }
  }

  const handleSearch = async (searchQuery) => {
    // If searchQuery is an event or undefined, use the query state
    const queryToSearch = typeof searchQuery === 'string' ? searchQuery : query
    
    if (!queryToSearch.trim() || !selectedDocId) {
      setError('Please enter a question and select a document')
      return
    }

    setSearching(true)
    setError(null)
    setResult(null)
    setShowViewer(false)

    try {
      const response = await fetch('/api/claude-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: queryToSearch,
          documentId: selectedDocId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Search failed')
      }

      setResult(data)
      
      // Show PDF viewer with first relevant page
      if (data.sections && data.sections.length > 0) {
        setPageNumber(data.sections[0].pdfPage || 1)
      }
      setShowViewer(true)
      
      console.log('Search result:', data)

    } catch (error) {
      console.error('Search error:', error)
      setError(error.message)
    } finally {
      setSearching(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !searching) {
      handleSearch()
    }
  }

  // Voice recording functions
  const startRecording = async () => {
    if (!selectedDocId) {
      setError('Please select a document first')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })
      
      audioChunksRef.current = []
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        await transcribeAndSearch(audioBlob)
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorderRef.current.start()
      setIsRecording(true)
      setError(null)
      
      console.log('🎤 Recording started')
      
    } catch (error) {
      console.error('Microphone access error:', error)
      setError('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      console.log('🛑 Recording stopped')
    }
  }

  const transcribeAndSearch = async (audioBlob) => {
    setIsTranscribing(true)
    
    try {
      // Send to Whisper for transcription
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      
      console.log('📤 Sending audio to Whisper...')
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || 'Transcription failed')
      }
      
      console.log('✅ Transcribed:', data.text)
      
      // Set the query and trigger search
      setQuery(data.text)
      await handleSearch(data.text)
      
    } catch (error) {
      console.error('Transcription error:', error)
      setError(`Voice search failed: ${error.message}`)
    } finally {
      setIsTranscribing(false)
    }
  }

  const currentDoc = documents.find(d => d.id === selectedDocId)
  const currentDocTitle = currentDoc?.title || currentDoc?.filename || 'Select a regulation'


  // Show PDF viewer with results if we have them
  if (showViewer && pdfUrl && result) {
    return (
      <PDFViewer
        url={pdfUrl}
        pageNumber={pageNumber}
        onClose={() => {
          setShowViewer(false)
          setResult(null)
        }}
        onPageChange={setPageNumber}
        documentId={selectedDocId}
        query={query}
        aiResult={result} // Pass Claude results to PDFViewer
        currentSection={result.sections?.[0] || null}
        alternativeMatches={result.sections || []} // Pass sections as alternatives
        onAlternativeClick={(section) => {
          setPageNumber(section.pdfPage)
        }}
        onTextQuery={(newQuery) => {
          // User typed new query in PDFViewer - search immediately
          setQuery(newQuery)
          handleSearch(newQuery)
        }}
        onVoiceClick={startRecording}
        onVoiceRelease={stopRecording}
        isListening={isRecording}
        voiceStatus={isTranscribing ? 'Converting to text...' : isRecording ? 'Release to send' : ''}
        defaultTab={result.metadata?.fastPath ? 'pdf' : 'ai'} // Open PDF tab for direct references
      />
    )
  }

  // Show search form
  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* Document Selector - starts empty */}
        <div className="mb-6 p-5 rounded-2xl bg-neutral-900/80 border-2 border-yellow-400/60">
          <div className="text-xs font-semibold text-yellow-400/90 uppercase tracking-wider mb-2">
            Select Regulation
          </div>
          
          <select
            value={selectedDocId || ''}
            onChange={(e) => setSelectedDocId(Number(e.target.value))}
            className="w-full rounded-xl bg-white/10 hover:bg-white/15 px-4 py-3 outline-none text-white font-medium transition cursor-pointer border border-white/20"
          >
            <option value="" style={{ background: '#0B0F19' }}>
              Choose a regulation to search
            </option>
            {documents.map(doc => (
              <option key={doc.id} value={doc.id} style={{ background: '#0B0F19' }}>
                {doc.title || doc.filename}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input - Mobile friendly stacked layout */}
        <div className="mb-6">
          {/* Voice Button - Hold to speak */}
          <div className="mb-3 flex justify-center">
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={!selectedDocId || searching || isTranscribing}
              className={`relative h-16 w-16 rounded-full ring-4 backdrop-blur transition disabled:opacity-50 disabled:cursor-not-allowed select-none
                ${isRecording 
                  ? 'ring-red-400 bg-red-400/20 scale-110' 
                  : isTranscribing
                  ? 'ring-yellow-400 bg-yellow-400/20'
                  : 'ring-yellow-400/70 bg-white/10 hover:bg-white/15 active:scale-95'
                }`}
              aria-label="Hold to speak"
            >
              <div className="flex items-center justify-center h-full">
                {isTranscribing ? (
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-yellow-400 border-t-transparent"></div>
                ) : (
                  <svg 
                    className={`h-8 w-8 ${isRecording ? 'text-red-400' : 'text-yellow-400'}`}
                    fill="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
                )}
              </div>
            </button>
          </div>
          
          <div className="text-center mb-3 text-sm h-5">
            {isRecording && (
              <div className="text-red-400 font-medium animate-pulse">
                🎤 Recording... Release to send
              </div>
            )}
            {isTranscribing && (
              <div className="text-white/70">
                Converting speech to text...
              </div>
            )}
            {!isRecording && !isTranscribing && (
              <div className="text-white/40">
                Hold button and speak
              </div>
            )}
          </div>
          
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask your question here or use voice..."
            disabled={searching || !selectedDocId || isRecording || isTranscribing}
            className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white text-base placeholder-white/40 outline-none focus:border-yellow-400/50 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !selectedDocId || !query.trim() || isRecording || isTranscribing}
            className="w-full px-8 py-4 bg-yellow-400/20 hover:bg-yellow-400/30 disabled:bg-neutral-800/50 disabled:text-white/30 disabled:cursor-not-allowed border border-yellow-400/30 rounded-xl text-yellow-400 text-base font-semibold transition"
          >
            {searching ? 'Searching...' : 'Search Regs'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="text-red-400 font-medium mb-2">Error</div>
            <div className="text-white/70">{error}</div>
          </div>
        )}

        {/* Loading State */}
        {searching && (
          <div className="mb-6 p-6 rounded-xl bg-neutral-900/50 border border-white/10">
            <div className="flex items-center justify-center mb-4">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-yellow-400 border-t-transparent"></div>
            </div>
            <div className="text-white/70 text-center mb-3">Regs is searching and analyzing...</div>
            
            {/* Progress bar that fills left to right */}
            <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 animate-progress-fill rounded-full"></div>
            </div>
            
            <style jsx>{`
              @keyframes progress-fill {
                0% {
                  width: 0%;
                }
                20% {
                  width: 30%;
                }
                40% {
                  width: 50%;
                }
                60% {
                  width: 70%;
                }
                80% {
                  width: 85%;
                }
                100% {
                  width: 95%;
                }
              }
              .animate-progress-fill {
                animation: progress-fill 12s cubic-bezier(0.4, 0, 0.2, 1) forwards;
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  )
}