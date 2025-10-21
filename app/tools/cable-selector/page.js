'use client'

import { useState, useRef, useEffect } from 'react'

const BoltIcon = ({ className = '', color = 'currentColor' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill={color} />
  </svg>
)

const AudioBars = ({ active = false }) => {
  if (!active) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
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

export default function VoltageDropCalculator() {
  const [phase, setPhase] = useState('single')
  const [cores, setCores] = useState('single')
  const [load, setLoad] = useState('10')
  const [length, setLength] = useState('10')
  const [cableSize, setCableSize] = useState('1.5')
  const [installMethod, setInstallMethod] = useState('G')
  const [insulation, setInsulation] = useState('V75')
  const [conductor, setConductor] = useState('copper')
  const [result, setResult] = useState(null)
  
  // Voice state
  const [isListening, setIsListening] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState('Tap to talk')
  const [transcript, setTranscript] = useState('')
  
  const resultsRef = useRef(null)
  const pcRef = useRef(null)
  const dcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const pendingCalculationRef = useRef(false)

  useEffect(() => {
    if (!remoteAudioRef.current) {
      const a = new Audio()
      a.autoplay = true
      a.playsInline = true
      remoteAudioRef.current = a
    }
  }, [])

  // Trigger calculation when pending and values are updated
  useEffect(() => {
    if (pendingCalculationRef.current && load && length) {
      pendingCalculationRef.current = false
      setTimeout(() => {
        calculateVoltageDrop()
      }, 100)
    }
  }, [load, length, phase, cores, conductor, cableSize, installMethod, insulation])

  const resistanceData = {
    copper: {
      '1.5': 16.5, '2.5': 9.01, '4': 5.61, '6': 3.75, '10': 2.23,
      '16': 1.40, '25': 0.884, '35': 0.638, '50': 0.471, '70': 0.327,
      '95': 0.236, '120': 0.188, '150': 0.153, '185': 0.123, '240': 0.0948,
      '300': 0.0770, '400': 0.0620
    },
    aluminum: {
      '16': 2.33, '25': 1.47, '35': 1.06, '50': 0.783, '70': 0.542,
      '95': 0.392, '120': 0.310, '150': 0.253, '185': 0.202, '240': 0.155,
      '300': 0.125, '400': 0.0981
    },
    tinned: {
      '1.5': 16.5, '2.5': 9.01, '4': 5.61, '6': 3.75, '10': 2.23,
      '16': 1.40, '25': 0.884, '35': 0.638, '50': 0.471, '70': 0.327,
      '95': 0.236, '120': 0.188, '150': 0.153, '185': 0.123, '240': 0.0948,
      '300': 0.0770, '400': 0.0620
    }
  }

  const reactanceData = {
    '1.5': 0.129, '2.5': 0.118, '4': 0.110, '6': 0.104, '10': 0.0967,
    '16': 0.0913, '25': 0.0895, '35': 0.0863, '50': 0.0829, '70': 0.0798,
    '95': 0.0790, '120': 0.0765, '150': 0.0765, '185': 0.0762, '240': 0.0751,
    '300': 0.0746, '400': 0.0740
  }

  const installationMethods = {
    'A1': 'Insulated conductors in conduit in thermally insulated wall',
    'A2': 'Multi-core cable in conduit in thermally insulated wall',
    'B1': 'Insulated conductors in conduit on/in masonry wall',
    'B2': 'Multi-core cable in conduit on/in masonry wall',
    'C': 'Cables clipped direct to surface',
    'D': 'Multi-core cable in conduit, trunking, or duct',
    'E': 'Multi-core cable in free air',
    'F': 'Single-core cables in free air',
    'G': 'Cables direct buried',
    'H': 'Cables in underground conduit'
  }

  const insulationTypes = {
    'V75': 'V75 Thermoplastic PVC (75°C)',
    'V90': 'V90 Thermoplastic PVC (90°C)',
    'XLPE': 'XLPE Cross-linked polyethylene (90°C)',
    'EPR': 'EPR Ethylene propylene rubber (90°C)'
  }

  const calculateVoltageDrop = () => {
    const current = parseFloat(load)
    const cableLength = parseFloat(length)
    
    if (!current || !cableLength) {
      setResult({ error: 'Please enter load current and cable length' })
      return
    }

    const resistance = resistanceData[conductor]?.[cableSize]
    const reactance = reactanceData[cableSize]
    
    if (!resistance || !reactance) {
      setResult({ error: `No data available for ${cableSize}mm² ${conductor} cable` })
      return
    }

    const impedance = Math.sqrt(Math.pow(resistance, 2) + Math.pow(reactance, 2))

    let voltageDrop
    let systemVoltage
    
    if (phase === 'single') {
      systemVoltage = 230
      voltageDrop = (2 * current * cableLength * impedance) / 1000
    } else {
      systemVoltage = 400
      voltageDrop = (Math.sqrt(3) * current * cableLength * impedance) / 1000
    }

    const percentage = (voltageDrop / systemVoltage) * 100
    const isAcceptable = percentage <= 5
    
    const maxLength = (systemVoltage * 0.05 * 1000) / 
                      (current * impedance * (phase === 'single' ? 2 : Math.sqrt(3)))

    const Vc = impedance
    const VcUsed = Vc
    const operatingTemp = '75°C'
    const calculationMethod = phase === 'single' 
      ? 'Single Phase: Vd = 2 × I × L × Z / 1000'
      : 'Three Phase: Vd = √3 × I × L × Z / 1000'

    setResult({
      voltageDrop: voltageDrop.toFixed(2),
      percentage: percentage.toFixed(2),
      acceptable: isAcceptable,
      maxLength: maxLength.toFixed(1),
      systemVoltage,
      resistance: resistance.toFixed(3),
      reactance: reactance.toFixed(3),
      impedance: impedance.toFixed(3),
      Vc: Vc.toFixed(3),
      VcUsed: VcUsed.toFixed(3),
      operatingTemp,
      calculationMethod,
      conductor,
      cableSize,
      current,
      length: cableLength,
      regulationVD: 'AS/NZS 3000:2018 Clause 3.6.2.2',
      regulationResistance: 'AS/NZS 3008.1.2:2017 Tables 30 & 34'
    })
    
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  const resetForm = () => {
    setResult(null)
    setTranscript('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startVoice = async () => {
    if (isListening) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.enabled = false)
      }
      setIsListening(false)
      setVoiceStatus('Tap to talk')
      return
    }

    try {
      setIsListening(true)
      setVoiceStatus('Getting microphone...')

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      localStreamRef.current = localStream

      if (pcRef.current && dcRef.current && dcRef.current.readyState === 'open') {
        const audioTrack = localStream.getAudioTracks()[0]
        audioTrack.enabled = true
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'audio')
        if (sender) {
          await sender.replaceTrack(audioTrack)
        } else {
          pcRef.current.addTrack(audioTrack, localStream)
        }
        setVoiceStatus('Listening - just speak!')
        return
      }

      await startConnection(localStream)
      setVoiceStatus('Listening - just speak!')

    } catch (error) {
      console.error('Voice error:', error)
      setIsListening(false)
      setVoiceStatus('Microphone access denied')
    }
  }

  const startConnection = async (localStream) => {
    try {
      setVoiceStatus('Connecting...')

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc

      if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0]
        pc.addTrack(audioTrack, localStream)
      }

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0] && remoteAudioRef.current) {
          remoteAudioRef.current.volume = 0
          remoteAudioRef.current.srcObject = event.streams[0]
          setTimeout(() => { remoteAudioRef.current.volume = 1 }, 200)
        }
      }

      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc

      dc.onclose = () => {
        setIsListening(false)
        setVoiceStatus('Tap to talk')
      }

      dc.onopen = () => {
        setVoiceStatus('Listening - just speak!')

        const sessionConfig = {
          type: 'session.update',
          session: {
            modalities: ['audio', 'text'],
            voice: 'alloy',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 500,
              silence_duration_ms: 1000
            },
            instructions: `You are a voltage drop calculator assistant. Extract ALL parameters from user speech and update the calculator.

REQUIRED parameters (must be provided):
- load current (in amps, A)
- cable length (in meters, m)

OPTIONAL parameters (use if mentioned, otherwise leave as default):
- phase: "single" or "three" (for three phase)
- cores: "single" or "multi" (for multi-core)
- conductor: "copper" or "plain copper", "tinned" or "tinned copper", "aluminum" or "aluminium"
- cableSize: cable size in mm² (e.g., "1.5", "2.5", "4", "6", "10", "16", etc.)
- installMethod: installation method code A1, A2, B1, B2, C, D, E, F, G, H
- insulation: "V75", "V90", "XLPE", or "EPR"

Common phrases:
- "20 amps" or "20 amp load" → load: 20
- "25 meters" or "25 meter run" → length: 25
- "single phase" or "230 volt" → phase: "single"
- "three phase" or "400 volt" → phase: "three"
- "2.5 millimeter squared" or "2.5 mm²" → cableSize: "2.5"
- "multi core" or "multicore" → cores: "multi"
- "tinned copper" → conductor: "tinned"
- "aluminium" or "aluminum" → conductor: "aluminum"
- "buried" or "direct buried" → installMethod: "G"
- "clipped to surface" or "surface mount" → installMethod: "C"

After extracting values, call update_values with ALL extracted parameters. If the user provides complete information (at least load and length), also set autoCalculate to true so the calculator runs automatically.

IMPORTANT: Keep your response VERY brief. Just say "Got it, calculating now" or "Calculating" when you have the values. Do NOT repeat back what the user said.`,
            tools: [
              {
                type: 'function',
                name: 'update_values',
                description: 'Update calculator fields with extracted values and optionally trigger calculation',
                parameters: {
                  type: 'object',
                  properties: {
                    load: { type: 'number', description: 'Load current in amps' },
                    length: { type: 'number', description: 'Cable length in meters' },
                    phase: { type: 'string', enum: ['single', 'three'], description: 'Single or three phase' },
                    cores: { type: 'string', enum: ['single', 'multi'], description: 'Single core or multi-core' },
                    conductor: { type: 'string', enum: ['copper', 'tinned', 'aluminum'], description: 'Conductor material' },
                    cableSize: { type: 'string', description: 'Cable size in mm²' },
                    installMethod: { type: 'string', enum: ['A1', 'A2', 'B1', 'B2', 'C', 'D', 'E', 'F', 'G', 'H'], description: 'Installation method code' },
                    insulation: { type: 'string', enum: ['V75', 'V90', 'XLPE', 'EPR'], description: 'Insulation type' },
                    autoCalculate: { type: 'boolean', description: 'If true, automatically run the calculation after updating values' }
                  },
                  required: []
                }
              }
            ]
          }
        }

        dc.send(JSON.stringify(sessionConfig))
      }

      dc.onmessage = async (event) => {
        const msg = JSON.parse(event.data)
        
        if (msg.type === 'conversation.item.input_audio_transcription.completed') {
          if (msg.transcript) {
            setTranscript(msg.transcript)
            setVoiceStatus('Processing...')
          }
        }

        if (msg.type === 'input_audio_buffer.speech_started') {
          setTranscript('')
          setVoiceStatus('Listening...')
        }

        if (msg.type === 'response.audio.delta' || msg.type === 'response.audio_transcript.delta') {
          setVoiceStatus('Speaking...')
        }

        if (msg.type === 'response.audio.done' || msg.type === 'response.content_part.done') {
          setVoiceStatus('Tap to talk')
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = false
            })
            setIsListening(false)
          }
        }

        if (msg.type === 'response.function_call_arguments.done' && msg.name === 'update_values') {
          try {
            const args = JSON.parse(msg.arguments)
            console.log('Updating values:', args)
            
            // Update all provided values
            if (args.load !== undefined) setLoad(String(args.load))
            if (args.length !== undefined) setLength(String(args.length))
            if (args.phase) setPhase(args.phase)
            if (args.cores) setCores(args.cores)
            if (args.conductor) setConductor(args.conductor)
            if (args.cableSize) setCableSize(String(args.cableSize))
            if (args.installMethod) setInstallMethod(args.installMethod)
            if (args.insulation) setInsulation(args.insulation)
            
            // Set flag for auto-calculation after state updates
            if (args.autoCalculate && args.load && args.length) {
              pendingCalculationRef.current = true
            }
            
            dc.send(JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: msg.call_id,
                output: 'Values updated successfully'
              }
            }))
            
            dc.send(JSON.stringify({ type: 'response.create' }))
            
          } catch (e) {
            console.error('Update error:', e)
          }
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
      setIsListening(false)
      setVoiceStatus('Connection failed')
    }
  }

  const stopVoice = () => {
    if (dcRef.current) {
      dcRef.current.close()
      dcRef.current = null
    }

    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }

    setIsListening(false)
    setVoiceStatus('Tap to talk')
  }

  useEffect(() => () => stopVoice(), [])

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 touch-manipulation select-none">
      <style jsx global>{`
        * {
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
        }
        input, select {
          user-select: text;
          -webkit-user-select: text;
        }
        body {
          overscroll-behavior: none;
          touch-action: pan-y;
        }
      `}</style>
      
      <div className="max-w-4xl mx-auto">
        <div className="p-4 rounded-xl bg-neutral-900/80 border-2 border-white/10 mt-1">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1">
              <h2 className="text-lg font-bold">Voltage Drop Calculator</h2>
              <p className="text-xs text-white/60">AS/NZS 3000 & 3008 Compliant</p>
            </div>
            <div className="flex flex-col items-center">
              <button
                className={`relative h-14 w-14 rounded-xl ring-2 backdrop-blur active:scale-95 transition touch-manipulation mb-1
                  ${isListening ? 'ring-yellow-400 bg-yellow-400/10' : 'ring-yellow-400/70 bg-white/10 hover:bg-white/15'}`}
                onClick={startVoice}
                aria-label="Voice input"
              >
                <div className="flex items-center justify-center h-full relative">
                  {isListening ? (
                    <AudioBars active />
                  ) : (
                    <BoltIcon className="h-7 w-7 pointer-events-none" color="#FACC15" />
                  )}
                </div>
              </button>
              {voiceStatus && (
                <div className="text-xs text-white/60 text-center leading-tight whitespace-nowrap">{voiceStatus}</div>
              )}
            </div>
          </div>
          
          {transcript && (
            <div className="w-full p-2 rounded-lg bg-white/5 border border-white/10 mb-2">
              <div className="text-xs text-white/60 mb-0.5">You said:</div>
              <div className="text-xs select-text">{transcript}</div>
            </div>
          )}
          
          <div className="space-y-2">
            {/* Load Current */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Load Current (A)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={load}
                onChange={(e) => setLoad(e.target.value)}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 text-lg font-bold text-center select-text touch-manipulation"
                placeholder="20"
              />
            </div>

            {/* Length */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Length (m)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 text-lg font-bold text-center select-text touch-manipulation"
                placeholder="25"
              />
            </div>

            {/* Cable Size */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Cable Size (mm²)</label>
              <select
                value={cableSize}
                onChange={(e) => setCableSize(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 font-bold text-base text-center select-text touch-manipulation"
              >
                {Object.keys(resistanceData[conductor] || resistanceData.copper)
                  .map(size => parseFloat(size))
                  .sort((a, b) => a - b)
                  .map(size => {
                    const sizeStr = size.toString()
                    return <option key={sizeStr} value={sizeStr}>{sizeStr} mm²</option>
                  })}
              </select>
            </div>

            {/* Supply Phase */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Supply Phase</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPhase('single')}
                  className={`py-2 px-3 rounded-lg border-2 transition font-semibold text-sm touch-manipulation ${
                    phase === 'single' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Single
                  <div className="text-xs opacity-70">230V</div>
                </button>
                <button
                  onClick={() => setPhase('three')}
                  className={`py-2 px-3 rounded-lg border-2 transition font-semibold text-sm touch-manipulation ${
                    phase === 'three' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Three Phase
                  <div className="text-xs opacity-70">400V</div>
                </button>
              </div>
            </div>

            {/* Cores */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Cores</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCores('single')}
                  className={`py-2 px-3 rounded-lg border-2 transition font-semibold text-sm touch-manipulation ${
                    cores === 'single' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Single Core
                </button>
                <button
                  onClick={() => setCores('multi')}
                  className={`py-2 px-3 rounded-lg border-2 transition font-semibold text-sm touch-manipulation ${
                    cores === 'multi' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Multi-Core
                </button>
              </div>
            </div>

            {/* Conductor */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Conductor</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setConductor('copper')}
                  className={`py-2 px-2 rounded-lg border-2 transition font-semibold text-xs touch-manipulation ${
                    conductor === 'copper' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Copper
                </button>
                <button
                  onClick={() => setConductor('tinned')}
                  className={`py-2 px-2 rounded-lg border-2 transition font-semibold text-xs touch-manipulation ${
                    conductor === 'tinned' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Tinned
                </button>
                <button
                  onClick={() => setConductor('aluminum')}
                  className={`py-2 px-2 rounded-lg border-2 transition font-semibold text-xs touch-manipulation ${
                    conductor === 'aluminum' 
                      ? 'border-yellow-400 bg-yellow-400/10 text-yellow-400' 
                      : 'border-white/20 hover:border-white/40'
                  }`}
                >
                  Aluminium
                </button>
              </div>
            </div>

            {/* Install Method */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Install Method</label>
              <select
                value={installMethod}
                onChange={(e) => setInstallMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 font-medium text-xs select-text touch-manipulation"
              >
                {Object.entries(installationMethods).map(([code, desc]) => (
                  <option key={code} value={code}>{code}: {desc}</option>
                ))}
              </select>
            </div>

            {/* Insulation */}
            <div>
              <label className="text-xs font-medium text-white/70 mb-1 block">Insulation</label>
              <select
                value={insulation}
                onChange={(e) => setInsulation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border-2 border-white/20 outline-none focus:border-yellow-400/50 font-medium text-xs select-text touch-manipulation"
              >
                {Object.entries(insulationTypes).map(([code, desc]) => (
                  <option key={code} value={code}>{desc}</option>
                ))}
              </select>
            </div>

            {/* Calculate Button */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={calculateVoltageDrop}
                className="flex-1 py-3 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-neutral-950 font-bold text-base transition touch-manipulation active:scale-98"
              >
                Calculate
              </button>
              <button
                onClick={resetForm}
                className="px-5 py-3 rounded-lg bg-white/5 hover:bg-white/10 border-2 border-white/20 font-medium text-xs transition touch-manipulation active:scale-98"
              >
                Reset
              </button>
            </div>
          </div>

          {result && (
            <div ref={resultsRef} className="mt-8 pt-8 border-t border-white/10 scroll-mt-4">
              {result.error ? (
                <div className="p-4 rounded-xl bg-red-500/10 border-2 border-red-500/30">
                  <p className="text-red-400 font-medium">{result.error}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`p-6 rounded-xl border-2 ${
                    result.acceptable 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-red-500/10 border-red-500/30'
                  }`}>
                    <div className="text-sm text-white/60 mb-2">Voltage Drop</div>
                    <div className="text-4xl sm:text-5xl font-bold mb-3">
                      {result.voltageDrop}V <span className="text-2xl sm:text-3xl">({result.percentage}%)</span>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      {result.acceptable ? (
                        <>
                          <span className="text-green-400 text-2xl">✓</span>
                          <span className="text-green-400 font-medium text-base sm:text-lg">
                            Complies with AS/NZS 3000 (≤5%)
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-red-400 text-2xl">✗</span>
                          <span className="text-red-400 font-medium text-base sm:text-lg">
                            Exceeds 5% limit - Use larger cable or shorter run
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">System Voltage</div>
                      <div className="text-xl sm:text-2xl font-bold">{result.systemVoltage}V</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">Max Length @ 5%</div>
                      <div className="text-xl sm:text-2xl font-bold">{result.maxLength}m</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">Resistance (R)</div>
                      <div className="text-lg sm:text-xl font-bold">{result.resistance} mΩ/m</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">Voltage Drop (Vc)</div>
                      <div className="text-lg sm:text-xl font-bold">{result.VcUsed} mV/A.m</div>
                      <div className="text-xs text-white/50 mt-1">
                        {phase === 'single' ? `3φ: ${result.Vc} × 1.155` : `From Table @ ${result.operatingTemp}`}
                      </div>
                    </div>
                    <div className="col-span-2 p-4 rounded-xl bg-yellow-400/10 border border-yellow-400/30">
                      <div className="text-xs text-yellow-400 mb-1">Calculation Method</div>
                      <div className="text-base sm:text-lg font-bold text-yellow-400">{result.calculationMethod}</div>
                      <div className="text-xs text-white/60 mt-1">
                        Formula: Vd = (Vc × I × L) / 1000
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">R (Resistance)</div>
                      <div className="text-sm font-bold">{result.resistance} mΩ/m</div>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60 mb-1">X (Reactance)</div>
                      <div className="text-sm font-bold">{result.reactance} mΩ/m</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-yellow-400/10 border border-yellow-400/30">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">📖</span>
                        <div>
                          <div className="font-medium text-yellow-400 text-sm sm:text-base">
                            {result.regulationVD}
                          </div>
                          <div className="text-sm text-white/70 mt-1">
                            Maximum voltage drop: 5% for final subcircuits and submains
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-yellow-400/10 border border-yellow-400/30">
                      <div className="flex items-start gap-3">
                        <span className="text-xl">📊</span>
                        <div>
                          <div className="font-medium text-yellow-400 text-sm sm:text-base">
                            {result.regulationResistance}
                          </div>
                          <div className="text-sm text-white/70 mt-1">
                            Conductor resistance and reactance values at 75°C operating temperature
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}