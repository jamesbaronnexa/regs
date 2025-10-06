// /app/page.js
'use client'

import { useState } from 'react'

export default function Home() {
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')

  const handleUpload = async (e) => {
    e.preventDefault()
    
    if (!file) {
      setMessage('Please select a file')
      return
    }

    setLoading(true)
    setProgress(0)
    setProgressLabel('Preparing upload...')
    setMessage('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      // Stage 1: Upload file
      setProgress(10)
      setProgressLabel('Uploading PDF to storage...')
      
      const response = await fetch('/api/upload-and-parse', {
        method: 'POST',
        body: formData
      })

      setProgress(40)
      setProgressLabel('Creating document records...')

      const data = await response.json()
      
      if (data.success) {
        setProgress(60)
        setProgressLabel('Processing TOC entries...')
        
        setMessage(`Success! Parsed ${data.tocCount} TOC entries from ${data.totalPages} pages`)
        setResult(data)
        
        // If indexing needed, trigger it
        if (data.needsIndexing && data.referenceDocId) {
          setProgress(70)
          setProgressLabel('Starting Azure indexing...')
          setMessage('Triggering Azure indexing... This may take a few minutes...')
          
          const indexResponse = await fetch('/api/index-standard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              referenceDocId: data.referenceDocId,
              documentId: data.documentId,
              fileName: data.fileName || file.name
            })
          })
          
          setProgress(85)
          setProgressLabel('Processing pages with Azure...')
          
          const indexData = await indexResponse.json()
          
          if (indexData.success) {
            setProgress(100)
            setProgressLabel('Complete!')
            
            if (indexData.alreadyIndexed) {
              setMessage(`Already indexed! ${indexData.totalPages} pages available for search.`)
            } else {
              setMessage(`Indexing complete! ${indexData.pagesIndexed} pages processed.`)
            }
          } else {
            setProgress(0)
            setProgressLabel('')
            setMessage(`Indexing error: ${indexData.error}`)
          }
        } else {
          setProgress(100)
          setProgressLabel('Complete!')
        }
      } else {
        setProgress(0)
        setProgressLabel('')
        setMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      setProgress(0)
      setProgressLabel('')
      setMessage(`Error: ${error.message}`)
    } finally {
      setLoading(false)
      // Clear progress after 2 seconds
      if (progress === 100) {
        setTimeout(() => {
          setProgress(0)
          setProgressLabel('')
        }, 2000)
      }
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Upload AS/NZS 3000:2018</h1>
        
        <form onSubmit={handleUpload} className="space-y-4">
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => setFile(e.target.files[0])}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          
          <button
            type="submit"
            disabled={loading || !file}
            className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
          >
            {loading ? 'Processing...' : 'Upload and Parse'}
          </button>
        </form>

        {/* Progress Bar */}
        {loading && (
          <div className="mt-6">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{progressLabel}</span>
              <span className="text-sm font-medium text-gray-700">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            {progress === 85 && (
              <p className="text-xs text-gray-600 mt-2">
                Azure processing may take 1-3 minutes for 600 pages...
              </p>
            )}
          </div>
        )}

        {message && (
          <div className={`mt-4 p-4 rounded ${message.includes('Error') || message.includes('error') ? 'bg-red-100' : 'bg-green-100'}`}>
            {message}
          </div>
        )}
        
        {result && result.sample && (
          <div className="mt-4">
            <h3 className="font-bold">Sample entries found:</h3>
            <pre className="text-xs bg-gray-100 p-2 mt-2 overflow-auto">
              {JSON.stringify(result.sample, null, 2)}
            </pre>
          </div>
        )}
        
        {result && result.needsIndexing && (
          <div className="mt-4 p-4 bg-yellow-100 rounded">
            <p className="font-bold">Azure Indexing Required</p>
            <p>Reference Doc ID: {result.referenceDocId}</p>
            <p>Existing pages: {result.existingPages || 0}</p>
            <p>Total to index: {result.totalPages}</p>
          </div>
        )}
        
        {result && result.alreadyIndexed && (
          <div className="mt-4 p-4 bg-green-100 rounded">
            <p className="font-bold">✨ Using Pre-Indexed Content</p>
            <p>Reference Doc ID: {result.referenceDocId}</p>
            <p>Total pages available: {result.totalPages}</p>
            <p className="text-sm mt-2">Search is ready to use immediately!</p>
          </div>
        )}
      </div>
    </div>
  )
}