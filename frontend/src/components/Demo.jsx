import { useState, useRef, useEffect } from 'react'
import { motion, useInView } from 'framer-motion'
import { Send, Bot, User } from 'lucide-react'
import { fadeUp, viewportOnce } from '../lib/animations'

const INITIAL_MESSAGES = [
  {
    role: 'assistant',
    text: 'Bonjour ! Je suis l\'assistant IA de démonstration de Novalis. Posez-moi une question sur nos services ou sur l\'automatisation de votre entreprise.',
  },
]

const QUICK_PROMPTS = [
  'Comment fonctionne l\'assistant vocal ?',
  'Quel est le prix du forfait Starter ?',
  'En combien de temps voyez-vous des résultats ?',
  'Quels secteurs servez-vous ?',
]

async function getResponse(input) {
  try {
    const res = await fetch('/api/v1/demo-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input }),
    })
    if (!res.ok) throw new Error('API error')
    const data = await res.json()
    return data.response
  } catch {
    return "Excellente question ! Pour une réponse personnalisée, contactez-nous via le formulaire — notre équipe vous répond en moins de 24h."
  }
}

export default function Demo() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef               = useRef(null)
  const ref                     = useRef(null)
  const inView                  = useInView(ref, viewportOnce)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: msg }])
    setLoading(true)
    const reply = await getResponse(msg)
    setMessages((m) => [...m, { role: 'assistant', text: reply }])
    setLoading(false)
  }

  return (
    <section id="demo" ref={ref} className="relative py-32 overflow-hidden">
      <span className="section-number top-0 right-[-1rem]" aria-hidden="true">05</span>

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="mb-14"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="copper-line w-10" />
            <span className="label-caps">Démo interactive</span>
          </div>
          <h2
            className="display-heading max-w-xl"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            Discutez avec
            <br />
            <em>notre IA maintenant</em>
          </h2>
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          transition={{ delay: 0.2 }}
        >
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Chat window */}
            <div className="lg:col-span-7">
              <div className="glass-card flex flex-col" style={{ height: '480px' }}>
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-6 py-4"
                  style={{ borderBottom: '0.5px solid rgba(237,232,223,0.08)' }}
                >
                  <div
                    className="w-8 h-8 flex items-center justify-center"
                    style={{ background: 'rgba(168,104,68,0.15)', border: '0.5px solid rgba(168,104,68,0.3)' }}
                  >
                    <Bot size={14} className="text-copper" />
                  </div>
                  <div>
                    <div className="text-xs font-sans text-pearl">Assistant Novalis IA</div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="text-[0.6rem] text-dim tracking-wider">En ligne</span>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div
                          className="w-6 h-6 shrink-0 flex items-center justify-center mt-1"
                          style={{ border: '0.5px solid rgba(168,104,68,0.3)', color: 'var(--copper)' }}
                        >
                          <Bot size={11} />
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-copper/15 border border-copper/20 text-pearl'
                            : 'glass-card-subtle pearl-border text-pearl/85'
                        }`}
                      >
                        {msg.text}
                      </div>
                      {msg.role === 'user' && (
                        <div
                          className="w-6 h-6 shrink-0 flex items-center justify-center mt-1"
                          style={{ background: 'rgba(168,104,68,0.2)', color: 'var(--copper)' }}
                        >
                          <User size={11} />
                        </div>
                      )}
                    </div>
                  ))}
                  {loading && (
                    <div className="flex gap-3">
                      <div
                        className="w-6 h-6 shrink-0 flex items-center justify-center"
                        style={{ border: '0.5px solid rgba(168,104,68,0.3)', color: 'var(--copper)' }}
                      >
                        <Bot size={11} />
                      </div>
                      <div className="glass-card-subtle pearl-border px-4 py-3 flex gap-1 items-center">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-dim"
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div
                  className="px-6 py-4"
                  style={{ borderTop: '0.5px solid rgba(237,232,223,0.08)' }}
                >
                  <form
                    className="flex gap-3"
                    onSubmit={(e) => { e.preventDefault(); send() }}
                  >
                    <input
                      type="text"
                      className="form-input flex-1 text-sm"
                      placeholder="Posez votre question…"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className="w-10 h-10 flex items-center justify-center transition-all duration-200 disabled:opacity-40"
                      style={{ background: 'var(--copper)', color: 'var(--pearl)' }}
                      aria-label="Envoyer"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Quick prompts + context */}
            <div className="lg:col-span-4 lg:col-start-9 space-y-6">
              <div>
                <p className="label-caps mb-4">Questions suggérées</p>
                <div className="flex flex-col gap-2">
                  {QUICK_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      className="text-left text-sm text-pearl/60 hover:text-pearl px-4 py-3 transition-all duration-200 glass-card-subtle pearl-border hover:border-copper/30"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="glass-card p-6"
                style={{ borderTop: '0.5px solid var(--copper)' }}
              >
                <p className="text-[0.65rem] tracking-widest uppercase text-dim mb-3">Modèle actif</p>
                <p className="text-sm text-pearl/60 leading-relaxed">
                  Vous chattez avec Claude IA d'Anthropic en temps réel. Votre assistant sera entraîné sur vos données,
                  votre catalogue et vos processus spécifiques.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
