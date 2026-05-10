import { useState, useEffect, useRef } from 'react'
import Vapi from '@vapi-ai/web'

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || '448ebe91-bb02-4e05-bdf4-1afef203072b'
const VAPI_ASSISTANT_ID = import.meta.env.VITE_VAPI_ASSISTANT_ID || 'cc9ca066-4b80-49ef-ae41-22a6d59c5a8d'

export default function VoiceDemo() {
  const [status, setStatus] = useState('idle') // idle | connecting | active | ended
  const [transcript, setTranscript] = useState([])
  const [isMuted, setIsMuted] = useState(false)
  const vapiRef = useRef(null)
  const transcriptRef = useRef(null)

  useEffect(() => {
    if (!VAPI_PUBLIC_KEY) return
    const vapi = new Vapi(VAPI_PUBLIC_KEY)
    vapiRef.current = vapi

    vapi.on('call-start', () => setStatus('active'))
    vapi.on('call-end', () => { setStatus('ended'); setTranscript([]) })
    vapi.on('error', () => setStatus('idle'))
    vapi.on('message', (msg) => {
      if (msg.type === 'transcript' && msg.transcriptType === 'final') {
        setTranscript(prev => [...prev.slice(-6), { role: msg.role, text: msg.transcript }])
      }
    })

    return () => { try { vapi.stop() } catch {} }
  }, [])

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  const start = async () => {
    if (!VAPI_ASSISTANT_ID) {
      alert('Agent vocal en cours de configuration — revenez dans 24h !')
      return
    }
    setStatus('connecting')
    setTranscript([])
    try {
      await vapiRef.current.start(VAPI_ASSISTANT_ID)
    } catch {
      setStatus('idle')
    }
  }

  const stop = () => {
    try { vapiRef.current?.stop() } catch {}
    setStatus('idle')
  }

  const toggleMute = () => {
    if (isMuted) { vapiRef.current?.unmute(); setIsMuted(false) }
    else { vapiRef.current?.mute(); setIsMuted(true) }
  }

  return (
    <section id="voice-demo" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(168,104,68,0.06) 0%, transparent 70%)'
      }} />

      <div className="max-w-3xl mx-auto px-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="copper-line w-10" />
          <span className="label-caps">Démo en direct</span>
          <div className="copper-line w-10" />
        </div>

        <h2 className="display-heading mb-4" style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>
          Parlez à notre agent IA<br /><em>maintenant</em>
        </h2>
        <p className="text-dim text-sm mb-12 max-w-md mx-auto">
          Testez directement depuis votre navigateur. L'agent répond en français québécois en moins de 2 secondes.
        </p>

        {/* Widget */}
        <div className="glass-card p-8 mx-auto max-w-md relative">
          <div className="absolute top-0 left-0 right-0 h-[0.5px]"
            style={{ background: 'linear-gradient(90deg, transparent, var(--copper), transparent)' }} />

          {/* Status indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className={`w-2 h-2 rounded-full ${
              status === 'active' ? 'bg-green-400 animate-pulse' :
              status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
              'bg-neutral-600'
            }`} />
            <span className="text-xs tracking-widest uppercase text-dim">
              {status === 'idle' ? 'Agent disponible' :
               status === 'connecting' ? 'Connexion...' :
               status === 'active' ? 'En communication' :
               'Appel terminé'}
            </span>
          </div>

          {/* Waveform visual */}
          <div className="flex items-center justify-center gap-1 h-12 mb-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className={`w-1 rounded-full transition-all duration-300 ${
                status === 'active' ? 'bg-copper' : 'bg-neutral-700'
              }`} style={{
                height: status === 'active'
                  ? `${20 + Math.sin(Date.now() / 200 + i) * 16}px`
                  : '6px',
                animation: status === 'active' ? `wave ${0.5 + i * 0.08}s ease-in-out infinite alternate` : 'none'
              }} />
            ))}
          </div>

          {/* Transcript */}
          {transcript.length > 0 && (
            <div ref={transcriptRef} className="mb-6 max-h-32 overflow-y-auto space-y-2 text-left">
              {transcript.map((t, i) => (
                <div key={i} className={`text-xs px-3 py-2 rounded ${
                  t.role === 'assistant'
                    ? 'bg-copper/10 text-pearl/80 border-l-2 border-copper'
                    : 'bg-neutral-800 text-pearl/60 text-right'
                }`}>
                  {t.text}
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          {status === 'idle' || status === 'ended' ? (
            <button onClick={start} className="btn-copper w-full flex items-center justify-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a11 11 0 0 1 11 11 11 11 0 0 1-11 11A11 11 0 0 1 1 12 11 11 0 0 1 12 1m0 2a9 9 0 0 0-9 9 9 9 0 0 0 9 9 9 9 0 0 0 9-9 9 9 0 0 0-9-9m0 4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1 1 1 0 0 1-1-1V8a1 1 0 0 1 1-1m0 8a1 1 0 0 1 1 1 1 1 0 0 1-1 1 1 1 0 0 1-1-1 1 1 0 0 1 1-1z"/>
              </svg>
              Démarrer la démo vocale
            </button>
          ) : status === 'connecting' ? (
            <button disabled className="btn-copper w-full opacity-60 cursor-not-allowed">
              Connexion en cours…
            </button>
          ) : (
            <div className="flex gap-3">
              <button onClick={toggleMute} className="flex-1 py-3 px-4 rounded text-sm border border-neutral-700 text-pearl/70 hover:border-copper transition-colors">
                {isMuted ? '🔇 Muet' : '🎙 Actif'}
              </button>
              <button onClick={stop} className="flex-1 py-3 px-4 rounded text-sm bg-red-900/30 border border-red-800 text-red-400 hover:bg-red-900/50 transition-colors">
                Terminer
              </button>
            </div>
          )}

          <p className="text-[0.65rem] text-dim text-center mt-4">
            Microphone requis · Conversation non enregistrée
          </p>
        </div>
      </div>

      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
      `}</style>
    </section>
  )
}
