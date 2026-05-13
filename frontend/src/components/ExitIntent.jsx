import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

const SESSION_KEY = 'novalis_exit_shown'

export default function ExitIntent() {
  const [visible, setVisible]   = useState(false)
  const [email, setEmail]       = useState('')
  const [name, setName]         = useState('')
  const [done, setDone]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const readyRef                = useRef(false)

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return

    // Only arm after 20s — avoids irritating fast bouncers
    const arm = setTimeout(() => { readyRef.current = true }, 20000)

    const handleMouseLeave = (e) => {
      if (!readyRef.current) return
      if (e.clientY > 20) return  // only trigger when cursor exits through top
      setVisible(true)
      sessionStorage.setItem(SESSION_KEY, '1')
    }

    document.addEventListener('mouseleave', handleMouseLeave)
    return () => {
      clearTimeout(arm)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  async function submit(e) {
    e.preventDefault()
    if (!email || !name) return
    setLoading(true)
    try {
      await fetch('/api/v1/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          service_type: 'Consultation gratuite',
          description: 'Demande via popup exit intent — analyse IA gratuite.',
        }),
      })
      setDone(true)
    } catch {
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
          style={{ background: 'rgba(9,12,15,0.88)', backdropFilter: 'blur(6px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setVisible(false) }}
        >
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative max-w-md w-full"
            style={{
              background: '#0f1419',
              border: '0.5px solid rgba(168,104,68,0.35)',
              padding: '40px 36px',
            }}
          >
            {/* Top copper bar */}
            <div
              className="absolute top-0 left-0 right-0 h-[1.5px]"
              style={{ background: 'linear-gradient(90deg, transparent, var(--copper), transparent)' }}
            />

            <button
              onClick={() => setVisible(false)}
              className="absolute top-4 right-4 text-pearl/30 hover:text-pearl/70 transition-colors"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>

            {!done ? (
              <>
                <p className="label-caps mb-4" style={{ color: 'var(--copper)' }}>Offre exclusive</p>
                <h2
                  className="font-display italic text-pearl mb-3"
                  style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', lineHeight: 1.2 }}
                >
                  Avant de partir —<br />
                  <em>analyse IA gratuite</em>
                </h2>
                <p className="text-dim text-sm mb-6 leading-relaxed">
                  Laissez-nous votre courriel et nous vous envoyons en 24h une analyse
                  personnalisée des opportunités IA pour votre entreprise. Aucun engagement.
                </p>

                <form onSubmit={submit} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Votre prénom"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full bg-transparent text-pearl text-sm px-4 py-3 outline-none"
                    style={{ border: '0.5px solid rgba(237,232,223,0.15)' }}
                  />
                  <input
                    type="email"
                    placeholder="Votre courriel professionnel"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-transparent text-pearl text-sm px-4 py-3 outline-none"
                    style={{ border: '0.5px solid rgba(237,232,223,0.15)' }}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-copper w-full text-sm"
                    style={{ opacity: loading ? 0.7 : 1 }}
                  >
                    {loading ? 'Envoi...' : 'Recevoir mon analyse gratuite →'}
                  </button>
                </form>

                <p className="text-dim text-[0.65rem] mt-4 text-center">
                  Réponse en 24h · Aucun vendeur · Désabonnement en 1 clic
                </p>
              </>
            ) : (
              <div className="text-center py-4">
                <div
                  className="w-12 h-12 mx-auto mb-5 flex items-center justify-center"
                  style={{ background: 'rgba(168,104,68,0.12)', border: '0.5px solid rgba(168,104,68,0.4)' }}
                >
                  <span className="text-2xl">✓</span>
                </div>
                <h3 className="font-display italic text-pearl text-xl mb-3">Merci, {name} !</h3>
                <p className="text-dim text-sm leading-relaxed">
                  Votre analyse IA personnalisée arrive dans les 24 prochaines heures.
                  Vérifiez aussi vos courriels indésirables.
                </p>
                <button
                  onClick={() => setVisible(false)}
                  className="mt-6 text-copper text-xs hover:text-copper-light transition-colors"
                >
                  Fermer
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
