// app/upload/page.js or wherever your upload component is
'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY // Use anon key on client
)

export default function UploadPage() {
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setUploading(true)
    setMessage('Uploading PDF...')
    
    try {
      // 1. Upload directly to Supabase Storage (bypasses API route size limit!)
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      
      const { data: storageData, error: storageError } = await supabase.storage
        .from('pdfs')
        .upload(fileName, file, {
          contentType: 'application/pdf',
          upsert: true
        })
      
      if (storageError) throw storageError
      
      setMessage('Processing PDF...')
      
      // 2. Call API to process it (only sends metadata, not the file!)
      const response = await fetch('/api/process-uploaded-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileName,
          originalName: file.name,
          fileSize: file.size
        })
      })
      
      const result = await response.json()
      
      if (!response.ok) throw new Error(result.error)
      
      setMessage(`Success! ${result.message}`)
      
    } catch (error) {
      console.error('Upload error:', error)
      setMessage(`Error: ${error.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-4">Upload PDF</h1>
      <input 
        type="file" 
        accept=".pdf"
        onChange={handleUpload}
        disabled={uploading}
        className="mb-4"
      />
      {message && <p className="text-sm">{message}</p>}
    </div>
  )
}