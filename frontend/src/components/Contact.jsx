import { useState, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Send, CheckCircle } from 'lucide-react'
import { fadeUp, fadeLeft, fadeRight, viewportOnce } from '../lib/animations'

const SERVICE_OPTIONS = [
  'Assistant vocal IA',
  'Chatbot / Messagerie',
  'Analyse prédictive',
  'Automatisation documentaire',
  'CRM augmenté',
  'Intégration sur mesure',
  'Autre / Consultation générale',
]

export default function Contact() {
  const [form, setForm]       = useState({ name: '', email: '', phone: '', business: '', service: '', desc: '' })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')

  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.desc) {
      setError('Veuillez remplir les champs obligatoires.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/v1/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:     form.name,
          email:    form.email,
          phone:    form.phone,
          business: form.business,
          service:  form.service,
          message:  form.desc,
        }),
      })
      if (!res.ok) throw new Error()
      setSuccess(true)
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer ou nous écrire à novalisproia@gmail.com')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="contact" ref={ref} className="relative py-32 overflow-hidden">
      <span className="section-number top-0 right-[-1rem]" aria-hidden="true">09</span>

      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(168,104,68,0.05) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-12 gap-16">

          {/* Left — context */}
          <motion.div
            className="lg:col-span-4"
            variants={fadeLeft}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="copper-line w-10" />
              <span className="label-caps">Consultation gratuite</span>
            </div>
            <h2
              className="display-heading mb-6"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)' }}
            >
              Parlons de
              <br />
              <em>votre projet</em>
            </h2>
            <p className="text-dim text-sm leading-relaxed mb-8">
              Un appel de 30 minutes avec notre équipe suffit pour identifier vos meilleures opportunités
              d'automatisation et estimer votre ROI potentiel.
            </p>

            <div className="space-y-4">
              {[
                { icon: '✓', text: 'Analyse de vos processus actifs' },
                { icon: '✓', text: 'Proposition personnalisée' },
                { icon: '✓', text: 'Estimation ROI sur 12 mois' },
                { icon: '✓', text: 'Sans engagement' },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <span className="text-copper text-sm">{item.icon}</span>
                  <span className="text-sm text-pearl/70">{item.text}</span>
                </div>
              ))}
            </div>

            <div
              className="mt-10 pt-8"
              style={{ borderTop: '0.5px solid rgba(237,232,223,0.08)' }}
            >
              <p className="text-[0.65rem] tracking-widest uppercase text-dim mb-2">Contact direct</p>
              <a
                href="mailto:novalisproia@gmail.com"
                className="text-sm text-pearl/70 hover:text-copper transition-colors"
              >
                novalisproia@gmail.com
              </a>
            </div>
          </motion.div>

          {/* Right — form */}
          <motion.div
            className="lg:col-span-7 lg:col-start-6"
            variants={fadeRight}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            {success ? (
              <div className="glass-card p-12 text-center h-full flex flex-col items-center justify-center gap-6">
                <CheckCircle size={48} className="text-copper" />
                <h3 className="font-display italic text-3xl text-pearl">Message envoyé !</h3>
                <p className="text-dim max-w-sm">
                  Notre équipe vous contactera dans les 24 heures pour planifier votre consultation gratuite.
                </p>
              </div>
            ) : (
              <form
                onSubmit={submit}
                className="glass-card p-8 space-y-5"
                noValidate
              >
                {/* Top accent */}
                <div
                  className="absolute top-0 left-0 right-0 h-[0.5px]"
                  style={{ background: 'linear-gradient(90deg, var(--copper) 0%, transparent 100%)' }}
                />

                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="cName" className="label-caps block mb-2">
                      Votre nom <span className="text-copper">*</span>
                    </label>
                    <input
                      id="cName"
                      type="text"
                      className="form-input"
                      placeholder="Marie Tremblay"
                      value={form.name}
                      onChange={update('name')}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="cEmail" className="label-caps block mb-2">
                      Courriel <span className="text-copper">*</span>
                    </label>
                    <input
                      id="cEmail"
                      type="email"
                      className="form-input"
                      placeholder="marie@entreprise.com"
                      value={form.email}
                      onChange={update('email')}
                      required
                    />
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="cPhone" className="label-caps block mb-2">Téléphone</label>
                    <input
                      id="cPhone"
                      type="tel"
                      className="form-input"
                      placeholder="514 555-0100"
                      value={form.phone}
                      onChange={update('phone')}
                    />
                  </div>
                  <div>
                    <label htmlFor="cBusiness" className="label-caps block mb-2">Entreprise</label>
                    <input
                      id="cBusiness"
                      type="text"
                      className="form-input"
                      placeholder="Nom de votre entreprise"
                      value={form.business}
                      onChange={update('business')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="cService" className="label-caps block mb-2">Service recherché</label>
                  <select
                    id="cService"
                    className="form-input"
                    value={form.service}
                    onChange={update('service')}
                  >
                    <option value="">Sélectionner…</option>
                    {SERVICE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="cDesc" className="label-caps block mb-2">
                    Décrivez votre besoin <span className="text-copper">*</span>
                  </label>
                  <textarea
                    id="cDesc"
                    className="form-input resize-none"
                    rows={4}
                    placeholder="Décrivez votre processus actuel et ce que vous aimeriez automatiser…"
                    value={form.desc}
                    onChange={update('desc')}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-400/10 px-4 py-3">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-copper w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Envoi en cours…' : (
                    <>
                      Envoyer ma demande
                      <Send size={13} />
                    </>
                  )}
                </button>

                <p className="text-[0.65rem] text-dim text-center tracking-wide">
                  Vos informations sont confidentielles et ne seront jamais partagées.
                </p>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
