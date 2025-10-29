'use client'

import { useState, useEffect } from 'react'
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
        onVoiceClick={() => {
          // Voice search not available in text-only mode
          alert('Voice search is only available in voice mode. Please type your question in the search box.')
        }}
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
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask your question here..."
            disabled={searching || !selectedDocId}
            className="w-full px-5 py-4 bg-white/10 border border-white/20 rounded-xl text-white text-base placeholder-white/40 outline-none focus:border-yellow-400/50 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !selectedDocId || !query.trim()}
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
          <div className="mb-6 p-8 rounded-xl bg-neutral-900/50 border border-white/10 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-yellow-400 border-t-transparent mb-4"></div>
            <div className="text-white/70">Claude is searching and analyzing...</div>
          </div>
        )}
      </div>
    </div>
  )
}