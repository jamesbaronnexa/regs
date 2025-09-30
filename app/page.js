// /app/page.js
'use client'

import { useState } from 'react'

export default function Home() {
  const [file, setFile] = useState(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleUpload = async (e) => {
    e.preventDefault()
    
    if (!file) {
      setMessage('Please select a file')
      return
    }

    setLoading(true)
    setMessage('Uploading and parsing PDF...')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload-and-parse', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      
      if (data.success) {
        setMessage(`Success! Parsed ${data.tocCount} TOC entries from ${data.totalPages} pages`)
        setResult(data)
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`)
    } finally {
      setLoading(false)
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
      </div>
    </div>
  )
}