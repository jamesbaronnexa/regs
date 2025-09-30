'use client'

import { useEffect, useRef, useState } from 'react'

const PDFJS_VERSION = '3.11.174'
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`

export default function PDFViewer({ url, pageNumber, onClose, onPageChange, highlightPhrases = [] }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const viewportRef = useRef(null)
  const textLayerRef = useRef(null)
  const pdfjsRef = useRef(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [lastRenderedPage, setLastRenderedPage] = useState(null)
  const renderTaskRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  
  // Touch gesture refs - simplified
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const touchStartTime = useRef(null)
  const lastTapTime = useRef(0)
  const pinchStartDistance = useRef(null)
  const initialPinchZoom = useRef(1)
  const isPanning = useRef(false)
  const lastPanOffset = useRef({ x: 0, y: 0 })

  // Load PDF.js from CDN
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.pdfjsLib) {
      pdfjsRef.current = window.pdfjsLib
      try { pdfjsRef.current.GlobalWorkerOptions.workerSrc = PDFJS_WORKER } catch {}
      setReady(true)
      return
    }
    const s = document.createElement('script')
    s.src = PDFJS_CDN
    s.async = true
    s.crossOrigin = 'anonymous'
    s.onload = () => {
      pdfjsRef.current = window.pdfjsLib
      try { pdfjsRef.current.GlobalWorkerOptions.workerSrc = PDFJS_WORKER } catch {}
      setReady(true)
    }
    s.onerror = () => console.error('Failed to load PDF.js from CDN')
    document.head.appendChild(s)
    return () => {
      try { document.head.removeChild(s) } catch {}
    }
  }, [])

  // Load PDF when ready
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!ready || !url) return
      try {
        const loadingTask = pdfjsRef.current.getDocument({ url })
        const pdf = await loadingTask.promise
        if (cancelled) return
        setPdfDoc(pdf)
        setNumPages(pdf.numPages)
        await renderPage(pdf, pageNumber)
      } catch (e) {
        console.error('PDF load error', e)
      }
    }
    load()
    return () => { cancelled = true; try { renderTaskRef.current?.cancel() } catch {} }
  }, [ready, url])

  // Render when pageNumber changes
  useEffect(() => {
    if (!pdfDoc) return
    if (pageNumber === lastRenderedPage) return
    
    // Reset zoom and pan when changing pages
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
    if (canvasRef.current) {
      canvasRef.current.style.transform = 'scale(1) translate(0px, 0px)'
    }
    
    renderPage(pdfDoc, pageNumber)
  }, [pdfDoc, pageNumber])

  // Handle window resize
  useEffect(() => {
    let timeout
    const handleResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        if (pdfDoc && pageNumber) {
          renderPage(pdfDoc, pageNumber)
        }
      }, 300)
    }
    
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timeout)
    }
  }, [pdfDoc, pageNumber])

  // Touch handlers - simplified for swipe only
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const getDistance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (e) => {
      if (e.touches.length === 1) {
        touchStartX.current = e.touches[0].clientX
        touchStartY.current = e.touches[0].clientY
        touchStartTime.current = Date.now()
        
        // Check for double tap
        const now = Date.now()
        if (now - lastTapTime.current < 300) {
          e.preventDefault()
          handleDoubleTap()
        }
        lastTapTime.current = now
        
        // Start panning if zoomed
        if (zoomLevel > 1) {
          isPanning.current = true
          lastPanOffset.current = { ...panOffset }
        }
      } else if (e.touches.length === 2) {
        // Start pinch zoom
        e.preventDefault()
        pinchStartDistance.current = getDistance(e.touches)
        initialPinchZoom.current = zoomLevel
        isPanning.current = false
      }
    }

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && pinchStartDistance.current) {
        // Handle pinch zoom
        e.preventDefault()
        const currentDistance = getDistance(e.touches)
        const scale = currentDistance / pinchStartDistance.current
        const newZoom = Math.max(1, Math.min(3, initialPinchZoom.current * scale))
        setZoomLevel(newZoom)
        
        if (canvasRef.current) {
          canvasRef.current.style.transform = `scale(${newZoom}) translate(${panOffset.x}px, ${panOffset.y}px)`
        }
      } else if (e.touches.length === 1 && isPanning.current && zoomLevel > 1) {
        // Handle panning when zoomed
        e.preventDefault()
        const deltaX = e.touches[0].clientX - touchStartX.current
        const deltaY = e.touches[0].clientY - touchStartY.current
        
        // Calculate new offset with bounds
        const maxOffset = (zoomLevel - 1) * 150
        const newOffset = {
          x: Math.max(-maxOffset, Math.min(maxOffset, lastPanOffset.current.x + deltaX)),
          y: Math.max(-maxOffset, Math.min(maxOffset, lastPanOffset.current.y + deltaY))
        }
        
        setPanOffset(newOffset)
        
        if (canvasRef.current) {
          canvasRef.current.style.transform = `scale(${zoomLevel}) translate(${newOffset.x}px, ${newOffset.y}px)`
        }
      }
    }

    const handleTouchEnd = (e) => {
      // Only handle swipe if not zoomed, not panning, and single touch
      if (e.changedTouches.length === 1 && zoomLevel === 1 && !isPanning.current && touchStartX.current && touchStartY.current) {
        const touchEndX = e.changedTouches[0].clientX
        const touchEndY = e.changedTouches[0].clientY
        const touchEndTime = Date.now()

        const deltaX = touchEndX - touchStartX.current
        const deltaY = touchEndY - touchStartY.current
        const deltaTime = touchEndTime - touchStartTime.current

        // Only process horizontal swipes
        if (deltaTime < 500 && Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX < 0 && !rendering) {
            // Swipe left - next page
            const target = Math.min(numPages, pageNumber + 1)
            if (target !== pageNumber) onPageChange?.(target)
          } else if (deltaX > 0 && !rendering) {
            // Swipe right - previous page
            const target = Math.max(1, pageNumber - 1)
            if (target !== pageNumber) onPageChange?.(target)
          }
        }
      }

      // Reset
      touchStartX.current = null
      touchStartY.current = null
      touchStartTime.current = null
      pinchStartDistance.current = null
      isPanning.current = false
    }

    const handleDoubleTap = () => {
      const newZoom = zoomLevel > 1 ? 1 : 2
      setZoomLevel(newZoom)
      
      if (newZoom === 1) {
        setPanOffset({ x: 0, y: 0 })
        if (canvasRef.current) {
          canvasRef.current.style.transform = 'scale(1) translate(0px, 0px)'
        }
      } else {
        if (canvasRef.current) {
          canvasRef.current.style.transform = `scale(2) translate(${panOffset.x}px, ${panOffset.y}px)`
        }
      }
    }

    viewport.addEventListener('touchstart', handleTouchStart, { passive: false })
    viewport.addEventListener('touchmove', handleTouchMove, { passive: false })
    viewport.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      viewport.removeEventListener('touchstart', handleTouchStart)
      viewport.removeEventListener('touchmove', handleTouchMove)
      viewport.removeEventListener('touchend', handleTouchEnd)
    }
  }, [pageNumber, numPages, rendering, onPageChange, zoomLevel, panOffset])

  async function renderPage(pdf, pageNum) {
    if (!pdf || !canvasRef.current || !containerRef.current) return

    try { renderTaskRef.current?.cancel() } catch {}

    setRendering(true)
    try {
      const page = await pdf.getPage(pageNum)
      
      // Get base viewport
      const baseViewport = page.getViewport({ scale: 1.0 })
      
      // Calculate display scale to fit screen
      const padding = 20
      const containerWidth = window.innerWidth - padding
      const containerHeight = window.innerHeight - 120 // Account for controls
      
      const scaleX = containerWidth / baseViewport.width
      const scaleY = containerHeight / baseViewport.height
      const displayScale = Math.min(scaleX, scaleY)
      
      // For high DPI screens, render at higher resolution
      // This is the key for sharp text
      const outputScale = window.devicePixelRatio || 1
      const renderScale = displayScale * outputScale * 2 // 2x for extra sharpness
      
      // Get viewport for rendering
      const viewport = page.getViewport({ scale: renderScale })
      
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      // Set actual canvas size (resolution)
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      // Set display size (CSS pixels)
      canvas.style.width = `${baseViewport.width * displayScale}px`
      canvas.style.height = `${baseViewport.height * displayScale}px`
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Set container size
      const container = containerRef.current
      container.style.width = `${baseViewport.width * displayScale}px`
      container.style.height = `${baseViewport.height * displayScale}px`
      container.style.position = 'relative'
      
      // Clean up old text layer
      if (textLayerRef.current) {
        textLayerRef.current.remove()
        textLayerRef.current = null
      }
      container.querySelectorAll('.pdf-highlight-box').forEach(el => el.remove())
      
      // Render PDF
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
        // Enable text rendering for better quality
        enableWebGL: false,
        renderInteractiveForms: false
      }
      
      const task = page.render(renderContext)
      renderTaskRef.current = task
      await task.promise
      
      // Create text layer for selection/search
      const textContent = await page.getTextContent()
      const textLayerDiv = document.createElement('div')
      textLayerDiv.className = 'textLayer'
      textLayerDiv.style.position = 'absolute'
      textLayerDiv.style.left = '0'
      textLayerDiv.style.top = '0'
      textLayerDiv.style.right = '0'
      textLayerDiv.style.bottom = '0'
      textLayerDiv.style.overflow = 'hidden'
      textLayerDiv.style.opacity = '0.01'
      textLayerDiv.style.pointerEvents = 'none'
      container.appendChild(textLayerDiv)
      textLayerRef.current = textLayerDiv
      
      // Apply zoom transform
      if (canvasRef.current) {
        canvasRef.current.style.transform = `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`
        canvasRef.current.style.transformOrigin = 'center center'
      }
      
      setLastRenderedPage(pageNum)
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') {
        console.error('Render error', e)
      }
    } finally {
      setRendering(false)
    }
  }

  function handlePrev() {
    if (rendering) return
    const target = Math.max(1, pageNumber - 1)
    if (target !== pageNumber) onPageChange?.(target)
  }

  function handleNext() {
    if (rendering) return
    const target = Math.min(numPages, pageNumber + 1)
    if (target !== pageNumber) onPageChange?.(target)
  }

  function handleZoomIn() {
    const newZoom = Math.min(zoomLevel * 1.5, 3)
    setZoomLevel(newZoom)
    if (canvasRef.current) {
      canvasRef.current.style.transform = `scale(${newZoom}) translate(${panOffset.x}px, ${panOffset.y}px)`
    }
  }

  function handleZoomOut() {
    const newZoom = Math.max(zoomLevel / 1.5, 1)
    setZoomLevel(newZoom)
    if (newZoom === 1) {
      setPanOffset({ x: 0, y: 0 })
    }
    if (canvasRef.current) {
      canvasRef.current.style.transform = `scale(${newZoom}) translate(${panOffset.x}px, ${panOffset.y}px)`
    }
  }

  function handleFitWidth() {
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
    if (canvasRef.current) {
      canvasRef.current.style.transform = 'scale(1) translate(0px, 0px)'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      {/* Header controls */}
      <div className="bg-white px-3 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 flex-shrink-0">
        <div className="text-sm text-gray-600">
          Page {pageNumber} {numPages ? `of ${numPages}` : ''} 
          {zoomLevel > 1 && ` · ${Math.round(zoomLevel * 100)}%`}
          {rendering && ' · Loading...'}
        </div>
        <div className="flex gap-2">
          <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handleZoomOut}>−</button>
          <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handleZoomIn}>+</button>
          <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handleFitWidth}>Fit</button>
          <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handlePrev}>◀</button>
          <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handleNext}>▶</button>
          <button className="px-2 py-1 bg-red-500 text-white rounded text-sm" onClick={onClose}>✕</button>
        </div>
      </div>
      
      {/* PDF viewport */}
      <div 
        ref={viewportRef}
        className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          touchAction: zoomLevel > 1 ? 'pan-x pan-y' : 'manipulation'
        }}
      >
        <div 
          ref={containerRef} 
          style={{ 
            position: 'relative',
            backgroundColor: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
        >
          <canvas 
            ref={canvasRef}
            style={{
              display: 'block',
              imageRendering: 'crisp-edges'
            }}
          />
        </div>
      </div>
      
      {/* Mobile hints */}
      {zoomLevel === 1 && (
        <div className="sm:hidden absolute bottom-4 left-0 right-0 text-center pointer-events-none">
          <div className="inline-block bg-black/70 text-white px-3 py-1 rounded-full text-xs">
            Swipe to navigate • Double tap or pinch to zoom
          </div>
        </div>
      )}
    </div>
  )
}