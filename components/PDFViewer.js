'use client'

import { useEffect, useRef, useState } from 'react'

const PDFJS_VERSION = '3.11.174' // stable, widely used
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`

export default function PDFViewer({ url, pageNumber, onClose, onPageChange, highlightPhrases = [] }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const textLayerRef = useRef(null)
  const pdfjsRef = useRef(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [lastRenderedPage, setLastRenderedPage] = useState(null)
  const renderTaskRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [scale, setScale] = useState(1.5)
  
  // Touch gesture refs
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const touchStartTime = useRef(null)

  // Load PDF.js from CDN (avoids Next/Webpack import issues)
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
    if (pageNumber === lastRenderedPage) return
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

  // Touch handlers for swipe gestures
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      touchStartTime.current = Date.now()
    }

    const handleTouchEnd = (e) => {
      if (!touchStartX.current || !touchStartY.current) return

      const touchEndX = e.changedTouches[0].clientX
      const touchEndY = e.changedTouches[0].clientY
      const touchEndTime = Date.now()

      const deltaX = touchEndX - touchStartX.current
      const deltaY = touchEndY - touchStartY.current
      const deltaTime = touchEndTime - touchStartTime.current

      // Reset
      touchStartX.current = null
      touchStartY.current = null
      touchStartTime.current = null

      // Check if it's a quick swipe (under 500ms) and mostly horizontal
      if (deltaTime > 500) return
      if (Math.abs(deltaY) > Math.abs(deltaX)) return // Vertical scroll, not a page swipe
      if (Math.abs(deltaX) < 50) return // Too small to be a swipe

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

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [pageNumber, numPages, rendering, onPageChange])

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
      
      // Calculate scale based on viewport width
      const baseViewport = page.getViewport({ scale: 1.0 })
      const containerWidth = window.innerWidth * 0.9 // 90vw as in your max-width
      const containerHeight = window.innerHeight * 0.8 // 80vh as in your max-height
      
      // Calculate scale to fit width or height, whichever is more constraining
      let calculatedScale = Math.min(
        containerWidth / baseViewport.width,
        containerHeight / baseViewport.height
      )
      
      // On mobile devices (width < 768px), prioritize width fitting
      if (window.innerWidth < 768) {
        calculatedScale = (window.innerWidth - 40) / baseViewport.width // -40 for padding
      }
      
      // Ensure minimum scale for readability
      calculatedScale = Math.max(calculatedScale, 0.5)
      
      setScale(calculatedScale)
      const viewport = page.getViewport({ scale: calculatedScale })

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      // Clear & size canvas
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      canvas.width = viewport.width
      canvas.height = viewport.height

      const container = containerRef.current
      container.style.position = 'relative'
      container.style.width = `${viewport.width}px`
      container.style.height = `${viewport.height}px`

      if (textLayerRef.current) textLayerRef.current.remove()
      container.querySelectorAll('.pdf-highlight-box').forEach((el) => el.remove())

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
    const newScale = Math.min(scale * 1.2, 3)
    setScale(newScale)
    if (pdfDoc) renderPage(pdfDoc, pageNumber)
  }

  function handleZoomOut() {
    const newScale = Math.max(scale * 0.8, 0.5)
    setScale(newScale)
    if (pdfDoc) renderPage(pdfDoc, pageNumber)
  }

  function handleFitWidth() {
    if (pdfDoc) renderPage(pdfDoc, pageNumber)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl p-3 max-w-[90vw] max-h-[90vh] w-full sm:w-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between mb-2 gap-2">
          <div className="text-sm text-gray-600">
            Page {pageNumber} {numPages ? `of ${numPages}` : ''} {rendering ? '· Rendering…' : ''}
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
        <div className="relative overflow-auto" style={{ maxWidth: '90vw', maxHeight: '80vh' }}>
          <div ref={containerRef} style={{ position: 'relative', touchAction: 'pan-y pinch-zoom' }}>
            <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto' }} />
          </div>
          {/* Swipe hint for mobile */}
          <div className="sm:hidden absolute bottom-4 left-0 right-0 text-center">
            <span className="text-xs text-gray-500 bg-white/90 px-2 py-1 rounded">
              Swipe left/right to change pages
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}