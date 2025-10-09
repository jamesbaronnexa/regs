'use client'

import { useEffect, useRef, useState } from 'react'

const PDFJS_VERSION = '3.11.174'
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`

function BoltIcon({ className = '', color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill={color} />
    </svg>
  )
}

function AudioBars({ active = false }) {
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
        .bars { display: grid; grid-auto-flow: column; gap: 4px; align-items: end; height: 20px; }
        .bars span { width: 3px; background: #FACC15; height: 8px; border-radius: 2px; animation: eq-bounce 900ms ease-in-out infinite; }
        @keyframes eq-bounce { 0%, 100% { height: 6px; opacity: .85; } 50% { height: 18px; opacity: 1; } }
      `}</style>
    </div>
  )
}

export default function PDFViewer({ 
  url, 
  pageNumber, 
  onClose, 
  onPageChange, 
  highlightPhrases = [],
  alternativeMatches = [],
  onAlternativeClick,
  isListening = false,
  voiceStatus = '',
  query = '',
  onVoiceClick,
  onTextQuery
}) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const viewportRef = useRef(null)
  const textLayerRef = useRef(null)
  const pdfjsRef = useRef(null)
  const renderTaskRef = useRef(null)
  
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [lastRenderedPage, setLastRenderedPage] = useState(null)
  const [ready, setReady] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [textInput, setTextInput] = useState('')
  
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const touchStartTime = useRef(null)
  const lastTapTime = useRef(0)
  const pinchStartDistance = useRef(null)
  const initialPinchZoom = useRef(1)
  const isPanning = useRef(false)
  const lastPanOffset = useRef({ x: 0, y: 0 })

  const handleTextSubmit = () => {
    if (textInput.trim() && onTextQuery) {
      onTextQuery(textInput.trim())
      setTextInput('')
    }
  }

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

  useEffect(() => {
    if (!pdfDoc) return
    if (pageNumber === lastRenderedPage) return
    
    setZoomLevel(1)
    setPanOffset({ x: 0, y: 0 })
    if (canvasRef.current) {
      canvasRef.current.style.transform = 'scale(1) translate(0px, 0px)'
    }
    
    renderPage(pdfDoc, pageNumber)
  }, [pdfDoc, pageNumber])

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
        
        const now = Date.now()
        if (now - lastTapTime.current < 300) {
          e.preventDefault()
          handleDoubleTap()
        }
        lastTapTime.current = now
        
        if (zoomLevel > 1) {
          isPanning.current = true
          lastPanOffset.current = { ...panOffset }
        }
      } else if (e.touches.length === 2) {
        e.preventDefault()
        pinchStartDistance.current = getDistance(e.touches)
        initialPinchZoom.current = zoomLevel
        isPanning.current = false
      }
    }

    const handleTouchMove = (e) => {
      if (e.touches.length === 2 && pinchStartDistance.current) {
        e.preventDefault()
        const currentDistance = getDistance(e.touches)
        const scale = currentDistance / pinchStartDistance.current
        const newZoom = Math.max(1, Math.min(3, initialPinchZoom.current * scale))
        setZoomLevel(newZoom)
        
        if (canvasRef.current) {
          canvasRef.current.style.transform = `scale(${newZoom}) translate(${panOffset.x}px, ${panOffset.y}px)`
        }
      } else if (e.touches.length === 1 && isPanning.current && zoomLevel > 1) {
        e.preventDefault()
        const deltaX = e.touches[0].clientX - touchStartX.current
        const deltaY = e.touches[0].clientY - touchStartY.current
        
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
      if (e.changedTouches.length === 1 && zoomLevel === 1 && !isPanning.current && touchStartX.current && touchStartY.current) {
        const touchEndX = e.changedTouches[0].clientX
        const touchEndY = e.changedTouches[0].clientY
        const touchEndTime = Date.now()

        const deltaX = touchEndX - touchStartX.current
        const deltaY = touchEndY - touchStartY.current
        const deltaTime = touchEndTime - touchStartTime.current

        if (deltaTime < 500 && Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX < 0 && !rendering) {
            const target = Math.min(numPages, pageNumber + 1)
            if (target !== pageNumber) onPageChange?.(target)
          } else if (deltaX > 0 && !rendering) {
            const target = Math.max(1, pageNumber - 1)
            if (target !== pageNumber) onPageChange?.(target)
          }
        }
      }

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
      
      const baseViewport = page.getViewport({ scale: 1.0 })
      
      const padding = 20
      const containerWidth = window.innerWidth - padding
      const containerHeight = window.innerHeight - 120
      
      const scaleX = containerWidth / baseViewport.width
      const scaleY = containerHeight / baseViewport.height
      const displayScale = Math.min(scaleX, scaleY)
      
      const outputScale = window.devicePixelRatio || 1
      const renderScale = displayScale * outputScale * 2
      
      const viewport = page.getViewport({ scale: renderScale })
      
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      canvas.style.width = `${baseViewport.width * displayScale}px`
      canvas.style.height = `${baseViewport.height * displayScale}px`
      
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      const container = containerRef.current
      container.style.width = `${baseViewport.width * displayScale}px`
      container.style.height = `${baseViewport.height * displayScale}px`
      container.style.position = 'relative'
      
      if (textLayerRef.current) {
        textLayerRef.current.remove()
        textLayerRef.current = null
      }
      container.querySelectorAll('.pdf-highlight-box').forEach(el => el.remove())
      
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
        enableWebGL: false,
        renderInteractiveForms: false
      }
      
      const task = page.render(renderContext)
      renderTaskRef.current = task
      await task.promise
      
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
      <div className="bg-black px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0 border-b border-white/10">
        <div className="text-sm text-white/70">
          Page {pageNumber} {numPages ? `of ${numPages}` : ''} 
          {zoomLevel > 1 && ` · ${Math.round(zoomLevel * 100)}%`}
          {rendering && ' · Loading...'}
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition" onClick={handleZoomOut}>−</button>
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition" onClick={handleZoomIn}>+</button>
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition" onClick={handleFitWidth}>Fit</button>
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition" onClick={handlePrev}>◀</button>
          <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition" onClick={handleNext}>▶</button>
          <button className="px-4 py-2 bg-red-500/80 hover:bg-red-500 text-white rounded-lg font-medium transition" onClick={onClose}>✕</button>
        </div>
      </div>

      <div className="flex-shrink-0 bg-neutral-900 border-b border-white/10">
        <div className="max-w-2xl mx-auto px-3 py-2">
          <div className="flex items-center gap-3">
            <button
              className={`relative h-12 w-12 rounded-lg ring-2 backdrop-blur active:scale-95 transition flex-shrink-0
                ${isListening ? 'ring-yellow-400 bg-yellow-400/20' : 'ring-yellow-400/70 bg-white/10 hover:bg-white/15'}`}
              onClick={onVoiceClick}
              aria-label="Tap to search"
            >
              <div className="flex items-center justify-center h-full relative">
                {isListening ? (
                  <AudioBars active />
                ) : (
                  <BoltIcon className="h-6 w-6" color="#FACC15" />
                )}
              </div>
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
                  placeholder={query ? `Asked: "${query.substring(0, 30)}${query.length > 30 ? '...' : ''}"` : "Type your question or tap voice button..."}
                  className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-white/40 outline-none focus:border-yellow-400/50"
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}
                  className="px-4 py-2 bg-yellow-400/20 hover:bg-yellow-400/30 disabled:bg-white/5 disabled:text-white/30 border border-yellow-400/30 rounded-lg text-yellow-400 text-sm font-medium transition"
                >
                  Ask
                </button>
              </div>
              {voiceStatus && (
                <div className="text-xs text-white/50 mt-1">{voiceStatus}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div 
        ref={viewportRef}
        className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center relative"
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

        {alternativeMatches.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
            <div className="max-w-2xl mx-auto px-3 pb-3 pointer-events-auto">
              <div className="bg-neutral-900/95 backdrop-blur-lg rounded-lg p-3 shadow-xl border border-white/10">
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="text-xs text-white/50">Also see:</div>
                  {alternativeMatches.map((alt, idx) => (
                    <button
                      key={idx}
                      onClick={() => onAlternativeClick?.(alt)}
                      className="px-3 py-1 rounded-full bg-yellow-400/10 hover:bg-yellow-400/20 transition border border-yellow-400/30 text-xs"
                      title={alt.title}
                    >
                      <span className="text-yellow-400 font-medium">{alt.section_number}</span>
                      <span className="text-white/60 ml-1">p{alt.page}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {zoomLevel === 1 && !query && (
        <div className="sm:hidden absolute bottom-4 left-0 right-0 text-center pointer-events-none">
          <div className="inline-block bg-black/70 text-white px-3 py-1 rounded-full text-xs">
            Swipe to navigate • Double tap or pinch to zoom
          </div>
        </div>
      )}
    </div>
  )
}