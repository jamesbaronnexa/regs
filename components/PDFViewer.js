'use client'

import { useEffect, useRef, useState } from 'react'

const PDFJS_VERSION = '3.11.174' // stable, widely used
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
  const [baseScale, setBaseScale] = useState(1.5)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  
  // Touch gesture refs
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const touchStartTime = useRef(null)
  const lastTapTime = useRef(0)
  const pinchStartDistance = useRef(null)
  const lastPinchZoom = useRef(1)
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

  // Load PDF when ready and url present
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
    if (pageNumber === lastRenderedPage && zoomLevel === lastPinchZoom.current) return
    
    // Reset zoom and pan BEFORE rendering new page
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
    if (canvasRef.current) {
      canvasRef.current.style.transform = 'scale(1) translate(0, 0)'
    }
    
    renderPage(pdfDoc, pageNumber)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, pageNumber])

  // Re-render on window resize for mobile responsiveness
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

  // Touch handlers for swipe, pinch, and pan gestures
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
          handleDoubleTap(e.touches[0].clientX, e.touches[0].clientY)
        }
        lastTapTime.current = now
        
        // Start panning if zoomed in
        if (zoomLevel > 1) {
          isPanning.current = true
          lastPanOffset.current = { ...panOffset }
        }
      } else if (e.touches.length === 2) {
        // Start pinch zoom
        e.preventDefault()
        pinchStartDistance.current = getDistance(e.touches)
        lastPinchZoom.current = zoomLevel
        isPanning.current = false
      }
    }

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && pinchStartDistance.current) {
        // Handle pinch zoom
        e.preventDefault()
        const currentDistance = getDistance(e.touches)
        const scale = currentDistance / pinchStartDistance.current
        const newZoom = Math.max(1, Math.min(4, lastPinchZoom.current * scale))
        setZoomLevel(newZoom)
        
        // Update canvas transform immediately for smooth zoom
        if (canvasRef.current) {
          const canvas = canvasRef.current
          canvas.style.transform = `scale(${newZoom}) translate(${panOffset.x / newZoom}px, ${panOffset.y / newZoom}px)`
        }
      } else if (e.touches.length === 1 && isPanning.current && zoomLevel > 1) {
        // Handle panning when zoomed in
        e.preventDefault()
        const deltaX = e.touches[0].clientX - touchStartX.current
        const deltaY = e.touches[0].clientY - touchStartY.current
        
        const newOffset = {
          x: lastPanOffset.current.x + deltaX,
          y: lastPanOffset.current.y + deltaY
        }
        
        // Limit panning to keep content in view
        const maxPan = (zoomLevel - 1) * 200
        newOffset.x = Math.max(-maxPan, Math.min(maxPan, newOffset.x))
        newOffset.y = Math.max(-maxPan, Math.min(maxPan, newOffset.y))
        
        setPanOffset(newOffset)
        
        if (canvasRef.current) {
          canvasRef.current.style.transform = `scale(${zoomLevel}) translate(${newOffset.x / zoomLevel}px, ${newOffset.y / zoomLevel}px)`
        }
      }
    }

    const handleTouchEnd = (e) => {
      // Handle swipe for page navigation (only when not zoomed)
      if (zoomLevel === 1 && touchStartX.current && touchStartY.current && !isPanning.current) {
        const touchEndX = e.changedTouches[0].clientX
        const touchEndY = e.changedTouches[0].clientY
        const touchEndTime = Date.now()

        const deltaX = touchEndX - touchStartX.current
        const deltaY = touchEndY - touchStartY.current
        const deltaTime = touchEndTime - touchStartTime.current

        // Check if it's a quick swipe (under 500ms) and mostly horizontal
        if (deltaTime < 500 && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
          // Swipe left (next page)
          if (deltaX < -50 && !rendering) {
            const target = Math.min(numPages || pageNumber + 1, pageNumber + 1)
            onPageChange?.(target)
          }
          // Swipe right (previous page)
          else if (deltaX > 50 && !rendering) {
            const target = Math.max(1, pageNumber - 1)
            onPageChange?.(target)
          }
        }
      }

      // Reset touch tracking
      touchStartX.current = null
      touchStartY.current = null
      touchStartTime.current = null
      pinchStartDistance.current = null
      isPanning.current = false
    }

    const handleDoubleTap = (clientX, clientY) => {
      if (zoomLevel > 1) {
        // Zoom out to fit
        setZoomLevel(1)
        setPanOffset({ x: 0, y: 0 })
        if (canvasRef.current) {
          canvasRef.current.style.transform = 'scale(1) translate(0, 0)'
        }
      } else {
        // Zoom in 2x centered on tap point
        setZoomLevel(2)
        // Calculate pan to center on tap point
        const rect = viewport.getBoundingClientRect()
        const tapX = clientX - rect.left - rect.width / 2
        const tapY = clientY - rect.top - rect.height / 2
        setPanOffset({ x: -tapX, y: -tapY })
        if (canvasRef.current) {
          canvasRef.current.style.transform = `scale(2) translate(${-tapX / 2}px, ${-tapY / 2}px)`
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

  // Re-apply highlights if phrases change
  useEffect(() => {
    if (!textLayerRef.current) return
    applyHighlights()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightPhrases, lastRenderedPage])

  async function renderPage(pdf, pageNum) {
    if (!pdf || !canvasRef.current || !containerRef.current) return

    try { renderTaskRef.current?.cancel() } catch {}

    setRendering(true)
    try {
      const page = await pdf.getPage(pageNum)
      
      // Calculate scale based on viewport width with higher resolution for mobile
      const baseViewport = page.getViewport({ scale: 1.0 })
      
      // Use more of the screen space - especially in landscape
      const padding = window.innerWidth < 768 ? 20 : 40 // Less padding on mobile
      const containerWidth = window.innerWidth - padding
      const containerHeight = window.innerHeight - 120 // Account for header/controls
      
      let calculatedScale = Math.min(
        containerWidth / baseViewport.width,
        containerHeight / baseViewport.height
      )
      
      // Detect orientation
      const isLandscape = window.innerWidth > window.innerHeight
      
      // On mobile devices, optimize for screen size
      if (window.innerWidth < 768 || isLandscape) {
        // In landscape or mobile, prioritize filling the screen
        if (isLandscape) {
          // In landscape, use height as constraint but ensure good width usage
          calculatedScale = containerHeight / baseViewport.height
          // Check if this makes it too wide
          if (baseViewport.width * calculatedScale > containerWidth) {
            calculatedScale = containerWidth / baseViewport.width
          }
        } else {
          // Portrait mode - fit to width
          calculatedScale = containerWidth / baseViewport.width
        }
        
        // Increase resolution for quality (2x for retina displays)
        const renderScale = calculatedScale * (window.devicePixelRatio || 2)
        setBaseScale(renderScale)
        
        const viewport = page.getViewport({ scale: renderScale })
        
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        // Clear & size canvas
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        canvas.width = viewport.width
        canvas.height = viewport.height
        
        // Set canvas display size to fit screen properly
        canvas.style.width = `${baseViewport.width * calculatedScale}px`
        canvas.style.height = `${baseViewport.height * calculatedScale}px`
        
        const container = containerRef.current
        container.style.position = 'relative'
        container.style.width = `${baseViewport.width * calculatedScale}px`
        container.style.height = `${baseViewport.height * calculatedScale}px`
      } else {
        // Desktop - similar logic but with more padding
        calculatedScale *= 1.5
        setBaseScale(calculatedScale)
        
        const viewport = page.getViewport({ scale: calculatedScale })
        
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        canvas.width = viewport.width
        canvas.height = viewport.height
        
        const displayScale = calculatedScale / 1.5
        canvas.style.width = `${baseViewport.width * displayScale}px`
        canvas.style.height = `${baseViewport.height * displayScale}px`
        
        const container = containerRef.current
        container.style.position = 'relative'
        container.style.width = `${baseViewport.width * displayScale}px`
        container.style.height = `${baseViewport.height * displayScale}px`
      }

      if (textLayerRef.current) textLayerRef.current.remove()
      container.querySelectorAll('.pdf-highlight-box').forEach((el) => el.remove())

      // Continue with rendering...
      const renderScale = baseScale
      const viewport = page.getViewport({ scale: renderScale })

      const textLayerDiv = document.createElement('div')
      textLayerDiv.className = 'textLayer'
      Object.assign(textLayerDiv.style, {
        position: 'absolute',
        left: 0, top: 0,
        width: `${viewport.width}px`,
        height: `${viewport.height}px`,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: 0.01,
      })
      container.appendChild(textLayerDiv)
      textLayerRef.current = textLayerDiv

      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise

      const textContent = await page.getTextContent()
      const frag = document.createDocumentFragment()
      const Util = pdfjsRef.current.Util
      textContent.items.forEach((item) => {
        const span = document.createElement('span')
        span.textContent = item.str

        const transform = Util.transform(
          Util.transform(viewport.transform, item.transform),
          [1, 0, 0, -1, 0, 0]
        )
        const fontSize = Math.hypot(transform[2], transform[3])
        const left = transform[4]
        const top = transform[5] - fontSize

        Object.assign(span.style, {
          position: 'absolute',
          left: `${left}px`,
          top: `${top}px`,
          fontSize: `${fontSize}px`,
          transform: `scaleX(${transform[0] / fontSize})`,
          whiteSpace: 'pre',
          color: 'transparent',
          userSelect: 'none',
          pointerEvents: 'none',
        })

        frag.appendChild(span)
      })
      textLayerDiv.appendChild(frag)

      // Apply current zoom and pan
      if (canvasRef.current) {
        canvasRef.current.style.transform = `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`
        canvasRef.current.style.transformOrigin = 'center center'
      }

      applyHighlights()
      setLastRenderedPage(pageNum)
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') {
        console.error('Render error', e)
      }
    } finally {
      setRendering(false)
    }
  }

  function clearHighlights() {
    if (!containerRef.current) return
    containerRef.current.querySelectorAll('.pdf-highlight-box').forEach((el) => el.remove())
  }

  function applyHighlights() {
    clearHighlights()
    if (!textLayerRef.current || !containerRef.current) return
    if (!highlightPhrases || highlightPhrases.length === 0) return
    // placeholder; can be filled later
  }

  function handlePrev() {
    if (rendering) return
    const target = Math.max(1, pageNumber - 1)
    onPageChange?.(target)
  }
  function handleNext() {
    if (rendering) return
    const target = Math.min(numPages || pageNumber + 1, pageNumber + 1)
    onPageChange?.(target)
  }

  // Zoom controls
  function handleZoomIn() {
    const newZoom = Math.min(zoomLevel * 1.5, 4)
    setZoomLevel(newZoom)
    if (canvasRef.current) {
      canvasRef.current.style.transform = `scale(${newZoom}) translate(${panOffset.x / newZoom}px, ${panOffset.y / newZoom}px)`
    }
  }

  function handleZoomOut() {
    const newZoom = Math.max(zoomLevel / 1.5, 1)
    setZoomLevel(newZoom)
    if (newZoom === 1) {
      setPanOffset({ x: 0, y: 0 })
    }
    if (canvasRef.current) {
      canvasRef.current.style.transform = `scale(${newZoom}) translate(${panOffset.x / newZoom}px, ${panOffset.y / newZoom}px)`
    }
  }

  function handleFitWidth() {
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
    if (canvasRef.current) {
      canvasRef.current.style.transform = 'scale(1) translate(0, 0)'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-3 max-w-[90vw] max-h-[90vh] w-full sm:w-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between mb-2 gap-2">
          <div className="text-sm text-gray-600">
            Page {pageNumber} {numPages ? `of ${numPages}` : ''} 
            {zoomLevel > 1 && ` · ${Math.round(zoomLevel * 100)}%`}
            {rendering ? ' · Rendering…' : ''}
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handleZoomOut}>−</button>
            <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handleZoomIn}>+</button>
            <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handleFitWidth}>Fit</button>
            <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handlePrev}>Prev</button>
            <button className="px-2 py-1 bg-gray-100 rounded text-sm" onClick={handleNext}>Next</button>
            <button className="px-2 py-1 bg-red-500 text-white rounded text-sm" onClick={onClose}>Close</button>
          </div>
        </div>
        <div 
          ref={viewportRef}
          className="relative overflow-auto" 
          style={{ 
            maxWidth: '90vw', 
            maxHeight: '80vh',
            touchAction: zoomLevel > 1 ? 'none' : 'auto'
          }}
        >
          <div ref={containerRef} style={{ 
            position: 'relative',
            margin: '0 auto',
            transition: 'none'
          }}>
            <canvas 
              ref={canvasRef} 
              style={{ 
                display: 'block',
                margin: '0 auto',
                transition: 'transform 0.1s ease-out',
                transformOrigin: 'center center'
              }} 
            />
          </div>
          {/* Mobile gesture hints */}
          {zoomLevel === 1 && (
            <div className="sm:hidden absolute bottom-4 left-0 right-0 text-center pointer-events-none">
              <div className="inline-block bg-black/70 text-white px-3 py-1 rounded-full text-xs">
                Swipe to navigate • Double tap to zoom • Pinch to zoom
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}