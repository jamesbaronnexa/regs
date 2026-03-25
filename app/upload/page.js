// /app/upload/page.js
'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function UploadPage() {
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

    try {
      // Stage 1: Upload directly to Supabase Storage (bypasses API size limit!)
      setProgress(10)
      setProgressLabel('Uploading PDF to Supabase Storage...')
      
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      
      const { data: storageData, error: storageError } = await supabase.storage
        .from('pdfs')
        .upload(fileName, file, {
          contentType: 'application/pdf',
          upsert: true
        })
      
      if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`)
      }
      
      console.log('File uploaded to storage:', fileName)
      
      // Stage 2: Process the uploaded PDF (API only receives metadata, not the file!)
      setProgress(40)
      setProgressLabel('Creating document records...')
      
      const response = await fetch('/api/process-uploaded-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileName,
          originalName: file.name,
          fileSize: file.size
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Processing failed')
      }
      
      if (data.success) {
        setProgress(60)
        setProgressLabel('Processing TOC entries...')
        
        setMessage(`Success! Parsed ${data.tocCount} TOC entries from ${data.totalPages} pages`)
        setResult(data)
        
        // Stage 3: If indexing needed, trigger it automatically
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
              fileName: fileName
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
        } else if (data.alreadyIndexed) {
          setProgress(100)
          setProgressLabel('Complete!')
          setMessage(`${data.message || 'Document already indexed and ready to search!'}`)
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
      console.error('Upload error:', error)
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
        <h1 className="text-3xl font-bold mb-8">Upload Building Standard PDF</h1>
        
        <div className="mb-4 p-4 bg-blue-50 rounded">
          <p className="text-sm text-blue-900">
            <strong>Supported documents:</strong> AS/NZS 3604, E2/AS1 External Moisture
          </p>
          <p className="text-xs text-blue-700 mt-1">
            Filename must contain: "3604", "e2", "moisture", etc.
          </p>
        </div>
        
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Select PDF file
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files[0])}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && (
              <p className="text-xs text-gray-600 mt-2">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>
          
          <button
            type="submit"
            disabled={loading || !file}
            className="bg-blue-500 text-white px-6 py-3 rounded font-medium disabled:bg-gray-400 hover:bg-blue-600 transition"
          >
            {loading ? 'Processing...' : 'Upload and Process'}
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
                Azure processing may take 1-3 minutes for large documents...
              </p>
            )}
          </div>
        )}

        {message && (
          <div className={`mt-4 p-4 rounded ${message.includes('Error') || message.includes('error') ? 'bg-red-100 text-red-900' : 'bg-green-100 text-green-900'}`}>
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
        
        {result && result.alreadyIndexed && (
          <div className="mt-4 p-4 bg-green-100 rounded border border-green-300">
            <p className="font-bold text-green-900">✨ Using Pre-Indexed Content</p>
            <p className="text-green-800 text-sm mt-2">
              This standard is already indexed. Search is ready to use immediately!
            </p>
          </div>
        )}
        
        {result && result.needsIndexing && (
          <div className="mt-4 p-4 bg-yellow-100 rounded border border-yellow-300">
            <p className="font-bold text-yellow-900">⚙️ Azure Indexing In Progress</p>
            <p className="text-yellow-800 text-sm">Reference Doc ID: {result.referenceDocId}</p>
            <p className="text-yellow-800 text-sm">Total pages to index: {result.totalPages}</p>
          </div>
        )}
      </div>
    </div>
  )
}