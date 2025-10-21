'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Calculator, Info, BookOpen } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const classes = {
  page: "min-h-screen bg-[#0B0B0B] text-white",
  container: "mx-auto max-w-2xl px-4 pb-32",
  heading: "pt-8 pb-4 text-2xl font-semibold",
  sub: "text-zinc-400",
  btnYellow: "inline-flex items-center gap-2 rounded-xl bg-[#FFD300] text-black font-semibold px-4 py-2",
  btnGhost: "inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800/60",
  input: "w-full rounded-xl bg-[#111111] border border-zinc-800 px-4 py-3 text-base outline-none focus:border-[#FFD300]",
  label: "text-sm text-zinc-400",
}

const BoltIcon = ({ className = '', color = 'currentColor' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill={color} />
  </svg>
)

const LogoRounded = ({ className = '', corner = 6 }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <rect x="0" y="0" width="24" height="24" rx={corner} fill="#FACC15" />
    <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill="#0B0F19" />
  </svg>
)

const AudioBars = ({ active = false }) => {
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
        .bars { display: grid; grid-auto-flow: column; gap: 6px; align-items: end; height: 28px; }
        .bars span { width: 4px; background: #FACC15; height: 10px; border-radius: 2px; animation: eq-bounce 900ms ease-in-out infinite; }
        @keyframes eq-bounce { 0%, 100% { height: 8px; opacity: .85; } 50% { height: 24px; opacity: 1; } }
      `}</style>
    </div>
  )
}

const CABLE_RESISTANCE = {
  1.0: 21.9, 1.5: 14.8, 2.5: 8.91, 4: 5.57, 6: 3.71, 10: 2.24,
  16: 1.40, 25: 0.889, 35: 0.634, 50: 0.444, 70: 0.317, 95: 0.235,
  120: 0.186, 150: 0.148, 185: 0.121, 240: 0.0929, 300: 0.0742, 400: 0.0557
}

const CABLE_SIZES = Object.keys(CABLE_RESISTANCE).map(Number)

// Find closest cable size
function findClosestCableSize(requestedSize) {
  return CABLE_SIZES.reduce((prev, curr) => 
    Math.abs(curr - requestedSize) < Math.abs(prev - requestedSize) ? curr : prev
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className={classes.label}>{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function toFixed(n, d = 1) {
  if (!isFinite(n)) return "-"
  return Number(n.toFixed(d)).toLocaleString()
}

export default function ToolsPage() {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [length, setLength] = useState('')
  const [cableSize, setCableSize] = useState(2.5)
  const [phase, setPhase] = useState('single')
  const [voltage, setVoltage] = useState(230)
  const [explain, setExplain] = useState(false)
  
  const [voltageDrop, setVoltageDrop] = useState(null)
  const [voltageDropPercent, setVoltageDropPercent] = useState(null)
  const [passes, setPasses] = useState(null)
  
  const [isListening, setIsListening] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [conversationState, setConversationState] = useState('idle')
  const [voiceStatus, setVoiceStatus] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const localStreamRef = useRef(null)
  const reconnectAttemptRef = useRef(0)

  useEffect(() => {
    const currentNum = parseFloat(current)
    const lengthNum = parseFloat(length)
    
    if (!currentNum || !lengthNum || !cableSize) {
      setVoltageDrop(null)
      setVoltageDropPercent(null)
      setPasses(null)
      return
    }
    
    const resistance = CABLE_RESISTANCE[cableSize]
    if (!resistance) return
    
    let vd = phase === 'single' 
      ? (2 * currentNum * lengthNum * resistance) / 1000
      : (Math.sqrt(3) * currentNum * lengthNum * resistance) / 1000
    
    const vdPercent = (vd / voltage) * 100
    
    setVoltageDrop(vd)
    setVoltageDropPercent(vdPercent)
    setPasses(vdPercent <= 5)
  }, [current, length, cableSize, phase, voltage])

  const handleTextQuery = async (text) => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      setError('Connection not ready. Please tap the voice button first.')
      return
    }

    console.log('📝 Sending text query:', text)
    setQuery(text)
    setVoiceStatus('Processing...')
    setConversationState('processing')

    dcRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: text
        }]
      }
    }))

    dcRef.current.send(JSON.stringify({
      type: 'response.create'
    }))
  }

  const startVoice = async () => {
    if (isListening) {
      stopVoice()
      return
    }

    try {
      setIsListening(true)
      setVoiceStatus('Getting microphone...')
      setError(null)

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      localStreamRef.current = localStream

      if (pcRef.current && dcRef.current && dcRef.current.readyState === 'open') {
        const audioTrack = localStream.getAudioTracks()[0]
        pcRef.current.addTrack(audioTrack, localStream)
        setVoiceStatus('Listening - say your calculation!')
        setConversationState('ready')
        return
      }

      await startConnection(localStream)
      setVoiceStatus('Listening - say your calculation!')
      setConversationState('ready')

    } catch (error) {
      console.error('Voice error:', error)
      setError('Microphone access denied or unavailable')
      setIsListening(false)
      setVoiceStatus('')
      setConversationState('idle')
    }
  }

  const startConnection = async (localStream = null) => {
    try {
      setVoiceStatus('Connecting...')
      setConversationState('idle')

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc

      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        pc.addTrack(audioTrack, localStream)
      }

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const audio = new Audio()
          audio.srcObject = event.streams[0]
          audio.autoplay = true
        }
      }

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onclose = () => {
        console.log('Data channel closed')
        if (isListening && reconnectAttemptRef.current < 3) {
          reconnectAttemptRef.current++
          setVoiceStatus(`Connection lost - reconnecting (${reconnectAttemptRef.current}/3)...`)
          setTimeout(() => startConnection(localStreamRef.current), 1000)
        } else {
          setVoiceStatus('Connection lost')
          setConversationState('idle')
        }
      }

      dc.onopen = () => {
        reconnectAttemptRef.current = 0
        setVoiceStatus('Listening - say your calculation!')
        setIsConnected(true)
        setConversationState('ready')

        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['audio', 'text'],
            voice: 'alloy',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1200
            },
            instructions: `You are a voltage drop calculator assistant for electricians.

When an electrician says something like:
- "Voltage drop for 20 amps, 30 meters, 2.5mm cable"
- "Check voltage drop, 32A, 40 meter run, 4mm"

Extract the values and call the set_calculator_values function.

Parse intelligently:
- Current: look for "amps", "A"
- Length: look for "meters", "m", "metre"
- Cable size: look for "mm" numbers like "2.5mm", "4mm", "1.5", etc. Extract the numeric value.
- Phase: if they say "three phase" or "3 phase" set phase to "three", otherwise "single"

After setting values, respond: "Calculating voltage drop for [current]A over [length] meters using [cable_size]mm cable."`,
            tools: [{
              type: 'function',
              name: 'set_calculator_values',
              description: 'Set voltage drop calculator input values',
              parameters: {
                type: 'object',
                properties: {
                  current: { type: 'number', description: 'Load current in amps' },
                  length: { type: 'number', description: 'Cable length in meters' },
                  cable_size: { type: 'number', description: 'Cable size in mm² - extract the numeric value (e.g., 2.5, 4, 6, 10, etc)' },
                  phase: { type: 'string', enum: ['single', 'three'], description: 'Circuit type' }
                },
                required: ['current', 'length', 'cable_size']
              }
            }]
          }
        }
        dc.send(JSON.stringify(sessionConfig))
      }

      dc.onmessage = async (event) => {
        const msg = JSON.parse(event.data)
        
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          if (msg.transcript) {
            setQuery(msg.transcript)
            setVoiceStatus('Processing...')
            setConversationState('processing')
          }
        }

        if (msg.type === 'input_audio_buffer.speech_started') {
          setQuery('')
          setVoiceStatus('Listening...')
          setConversationState('listening')
          setError(null)
        }

        if (msg.type === 'response.audio.delta' || msg.type === 'response.audio_transcript.delta') {
          setVoiceStatus('Speaking...')
          setConversationState('speaking')
        }

        if (msg.type === 'response.done') {
          setConversationState('ready')
          setVoiceStatus('Ready - say another calculation!')
          setTimeout(() => { if (conversationState === 'ready') setQuery('') }, 3000)
        }

        if (msg.type === 'response.function_call_arguments.done' && msg.name === 'set_calculator_values') {
          try {
            const args = JSON.parse(msg.arguments)
            console.log('🔧 Received args:', args)
            
            if (args.current) setCurrent(String(args.current))
            if (args.length) setLength(String(args.length))
            if (args.cable_size) {
              // Find closest valid cable size
              const closestSize = findClosestCableSize(args.cable_size)
              console.log(`📏 Requested ${args.cable_size}mm² → Using ${closestSize}mm²`)
              setCableSize(closestSize)
            }
            if (args.phase) {
              setPhase(args.phase)
              setVoltage(args.phase === 'three' ? 400 : 230)
            }
            
            setVoiceStatus('Calculator updated!')
            
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: { type: 'function_call_output', call_id: msg.call_id, output: 'Values set successfully' }
            }))
            dc.send(JSON.stringify({ type: 'response.create', response: { modalities: ['audio', 'text'] } }))
            
          } catch (e) {
            console.error('Error:', e)
            setError(`Failed to parse values: ${e.message}`)
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: { type: 'function_call_output', call_id: msg.call_id, output: 'ERROR: Could not parse values' }
            }))
            dc.send(JSON.stringify({ type: 'response.create' }))
          }
        }

        if (msg.type === 'error') {
          console.error('API Error:', msg.error)
          setError(`${msg.error?.message || 'Unknown error'}`)
          setVoiceStatus('')
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') resolve()
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') resolve()
        }
        setTimeout(resolve, 2000)
      })

      const response = await fetch('/api/realtime-regs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: pc.localDescription.sdp })
      })

      if (!response.ok) throw new Error('Failed to connect')

      const { sdp: answer } = await response.json()
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })

    } catch (error) {
      console.error('Connection error:', error)
      setError('Connection failed. Please try again.')
      stopVoice()
    }
  }

  const stopVoice = () => {
    if (dcRef.current) { dcRef.current.close(); dcRef.current = null }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    setIsListening(false)
    setIsConnected(false)
    setVoiceStatus('')
    setConversationState('idle')
    reconnectAttemptRef.current = 0
  }

  useEffect(() => () => { stopVoice() }, [])

  const pctColor = voltageDropPercent !== null
    ? voltageDropPercent < 3 ? "text-green-400"
      : voltageDropPercent <= 5 ? "text-yellow-300" : "text-red-400"
    : "text-zinc-400"

  return (
    <main className={classes.page}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 24px),
            repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 24px)
          `
        }}
      />

      <div className={classes.container}>
        <header className="relative z-10 pt-8 pb-8">
          <div className="flex items-center gap-3">
            <LogoRounded className="h-8 w-8" />
            <h1 className="text-2xl font-semibold">Regs</h1>
          </div>
        </header>

        <div className="relative z-10 mt-6">
          {/* Voice/Text Control */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <button
                className={`relative h-16 w-16 rounded-xl ring-2 backdrop-blur active:scale-95 transition flex-shrink-0
                  ${isListening ? 'ring-yellow-400 bg-yellow-400/10' : 'ring-yellow-400/70 bg-white/10 hover:bg-white/15'}`}
                onClick={startVoice}
                aria-label="Tap to talk"
              >
                <div className="flex items-center justify-center h-full relative">
                  {isListening ? <AudioBars active /> : <BoltIcon className="h-7 w-7" color="#FACC15" />}
                </div>
              </button>

              <div className="flex-1">
                {isConnected ? (
                  query ? (
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">You asked:</div>
                      <div className="text-sm">{query}</div>
                    </div>
                  ) : (
                    <form onSubmit={(e) => {
                      e.preventDefault()
                      const input = e.target.querySelector('input')
                      if (input.value.trim()) {
                        handleTextQuery(input.value.trim())
                        input.value = ''
                      }
                    }} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Type your question or use voice..."
                        className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white text-sm placeholder-white/40 outline-none focus:border-yellow-400/50"
                      />
                      <button
                        type="submit"
                        className="px-5 py-3 bg-yellow-400/20 hover:bg-yellow-400/30 border border-yellow-400/30 rounded-xl text-yellow-400 text-sm font-medium transition"
                      >
                        Ask
                      </button>
                    </form>
                  )
                ) : (
                  <div className="text-sm text-white/60">
                    Tap the voice button to start
                  </div>
                )}
              </div>
            </div>

            {voiceStatus && <div className="text-xs text-white/60 text-center">{voiceStatus}</div>}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-sm text-red-400">{error}</div>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-800 bg-[#111111] p-4">
            <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <Calculator className="h-5 w-5 text-[#FFD300]" />
              <span>Voltage Drop</span>
            </div>

            <div className="grid gap-4">
              <Field label="Current">
                <div className="flex items-center gap-3">
                  <input 
                    type="number" 
                    className="w-32 rounded-xl bg-[#111111] border border-zinc-800 px-4 py-3 text-2xl font-semibold text-center outline-none focus:border-[#FFD300]" 
                    value={current} 
                    onChange={(e) => setCurrent(e.target.value)} 
                  />
                  <span className="text-zinc-500 text-lg">A</span>
                </div>
              </Field>
              <Field label="Length">
                <div className="flex items-center gap-3">
                  <input 
                    type="number" 
                    className="w-32 rounded-xl bg-[#111111] border border-zinc-800 px-4 py-3 text-2xl font-semibold text-center outline-none focus:border-[#FFD300]" 
                    value={length} 
                    onChange={(e) => setLength(e.target.value)} 
                  />
                  <span className="text-zinc-500 text-lg">m</span>
                </div>
              </Field>
              <Field label="Cable Size">
                <div className="flex items-center gap-3">
                  <select 
                    value={cableSize} 
                    onChange={(e) => setCableSize(Number(e.target.value))} 
                    className="w-36 rounded-xl bg-[#111111] border border-zinc-800 px-4 py-3 text-2xl font-semibold text-center outline-none focus:border-[#FFD300] cursor-pointer"
                  >
                    {CABLE_SIZES.map(size => (
                      <option key={size} value={size} style={{ background: '#111111' }}>{size}</option>
                    ))}
                  </select>
                  <span className="text-zinc-500 text-lg">mm²</span>
                </div>
              </Field>
              <Field label="Phase">
                <div className="flex gap-2">
                  <button onClick={() => { setPhase('single'); setVoltage(230) }} className={`${phase === 'single' ? classes.btnYellow : classes.btnGhost} !py-3 flex-1`}>Single‑phase</button>
                  <button onClick={() => { setPhase('three'); setVoltage(400) }} className={`${phase === 'three' ? classes.btnYellow : classes.btnGhost} !py-3 flex-1`}>Three‑phase</button>
                </div>
              </Field>
            </div>

            {voltageDrop !== null && (
              <div className="mt-4 rounded-xl border border-zinc-800 bg-[#0d0d0d] p-4">
                <div className="text-zinc-400">Result</div>
                <div className={`text-3xl font-bold ${pctColor}`}>
                  ΔV = {toFixed(voltageDrop, 2)} V · {toFixed(voltageDropPercent, 2)}%
                </div>
                <div className="text-sm text-zinc-400">{phase === 'three' ? '3‑phase' : '1‑phase'} · {current} A · {length} m · {cableSize} mm²</div>
                
                <div className="mt-3 flex gap-2">
                  <button 
                    className={classes.btnGhost} 
                    onClick={() => router.push('/search')}
                  >
                    <BookOpen className="h-4 w-4"/> View Clause 3.6.2
                  </button>
                  <button className={classes.btnGhost} onClick={() => setExplain(v => !v)}>
                    <Info className="h-4 w-4"/> {explain ? 'Hide' : 'Explain'}
                  </button>
                </div>

                <AnimatePresence>
                  {explain && (
                    <motion.pre
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-sm text-zinc-300"
                    >
{`Formula: ${phase === 'single' ? 'ΔV = 2 × I × L(km) × R' : 'ΔV = √3 × I × L(km) × R'}
L(km) = ${length} m → ${(parseFloat(length) / 1000).toFixed(3)} km
R = ${CABLE_RESISTANCE[cableSize]} Ω/km

ΔV = ${phase === 'three' ? '√3' : '2'} × ${current} × ${(parseFloat(length) / 1000).toFixed(3)} × ${CABLE_RESISTANCE[cableSize]}
= ${toFixed(voltageDrop, 3)} V

%Drop = (ΔV / ${voltage}) × 100 = ${toFixed(voltageDropPercent, 3)}%`}
                    </motion.pre>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}