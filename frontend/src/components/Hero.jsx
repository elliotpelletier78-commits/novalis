import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { blurIn, fadeUp, stagger, viewportOnce } from '../lib/animations'

export default function Hero() {
  return (
    <section
      className="relative min-h-screen flex items-end pb-20 pt-32 overflow-hidden"
      aria-label="Introduction"
    >
      {/* Background gradient blobs */}
      <div
        className="absolute top-1/4 right-0 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(168,104,68,0.06) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(29,39,51,0.8) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Section number watermark */}
      <span className="section-number top-20 right-[-2rem]" aria-hidden="true">01</span>

      <div className="max-w-7xl mx-auto px-6 w-full">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-0 items-end">

          {/* Left — main headline */}
          <motion.div
            className="lg:col-span-7 lg:col-start-1"
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {/* Label */}
            <motion.div variants={fadeUp} className="flex items-center gap-3 mb-10">
              <div className="copper-line w-10" />
              <span className="label-caps">Intelligence artificielle · Québec</span>
            </motion.div>

            {/* H1 */}
            <motion.h1
              variants={blurIn}
              className="display-heading mb-6"
              style={{ fontSize: 'clamp(3.5rem, 9vw, 8.5rem)' }}
            >
              Vos processus
              <br />
              <span className="text-copper-light">automatisés.</span>
              <br />
              Votre croissance
              <br />
              <em>amplifiée.</em>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={fadeUp}
              className="text-dim text-lg max-w-xl leading-relaxed mb-12 font-sans"
            >
              Novalis IA intègre l'intelligence artificielle directement dans vos opérations —
              assistants vocaux, chatbots, analyse prédictive — avec des résultats mesurables
              en moins de 30 jours.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeUp} className="flex flex-wrap gap-4">
              <a href="#contact" className="btn-copper inline-flex items-center gap-2">
                Consultation gratuite
                <ArrowRight size={14} />
              </a>
              <a href="#demo" className="btn-ghost inline-flex items-center gap-2">
                Voir la démo
              </a>
            </motion.div>

            {/* Trust strip */}
            <motion.div
              variants={fadeUp}
              className="flex items-center gap-6 mt-14 pt-10 pearl-border border-t border-b-0 border-l-0 border-r-0"
              style={{ borderTop: '0.5px solid rgba(237,232,223,0.1)' }}
            >
              {[
                { value: '40+', label: 'entreprises' },
                { value: '180k$', label: 'économisés/an moy.' },
                { value: '30 j', label: 'premier ROI' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="font-display italic text-2xl text-copper-light">{stat.value}</div>
                  <div className="text-[0.65rem] tracking-widest uppercase text-dim mt-1">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Right — floating glass card */}
          <motion.div
            className="lg:col-span-4 lg:col-start-9"
            initial={{ opacity: 0, x: 40, y: 20 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          >
            <div className="glass-card p-8 relative">
              {/* Top accent line */}
              <div
                className="absolute top-0 left-0 right-0 h-[0.5px]"
                style={{ background: 'linear-gradient(90deg, var(--copper) 0%, transparent 100%)' }}
              />

              <div className="flex items-center gap-2 mb-6">
                <Sparkles size={14} className="text-copper" />
                <span className="label-caps">Cas client récent</span>
              </div>

              <blockquote className="font-display italic text-xl text-pearl leading-snug mb-6">
                "En 6 semaines, notre service client gère 80 % des demandes de façon autonome. Le ROI dépasse toutes nos projections."
              </blockquote>

              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 flex items-center justify-center text-xs font-sans font-medium"
                  style={{ background: 'var(--copper)', color: 'var(--pearl)' }}
                >
                  MR
                </div>
                <div>
                  <div className="text-sm text-pearl font-sans">Marie Rioux</div>
                  <div className="text-[0.7rem] text-dim">DG, Groupe Rioux Distribution</div>
                </div>
              </div>

              {/* Bottom stats row */}
              <div
                className="grid grid-cols-2 gap-4 mt-8 pt-6"
                style={{ borderTop: '0.5px solid rgba(237,232,223,0.08)' }}
              >
                <div>
                  <div className="text-2xl font-display italic text-copper-light">80%</div>
                  <div className="text-[0.65rem] tracking-wider uppercase text-dim">Automatisé</div>
                </div>
                <div>
                  <div className="text-2xl font-display italic text-copper-light">-62%</div>
                  <div className="text-[0.65rem] tracking-wider uppercase text-dim">Coûts opérationnels</div>
                </div>
              </div>
            </div>

            {/* Floating badge */}
            <motion.div
              className="glass-card-subtle flex items-center gap-3 px-5 py-3 mt-4 ml-8 copper-border inline-flex"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-pearl/70 font-sans">IA active — répond en &lt; 1 s</span>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 1.5 }}
        aria-hidden="true"
      >
        <span className="text-[0.6rem] tracking-[0.25em] uppercase font-sans text-pearl">Défiler</span>
        <motion.div
          className="w-[0.5px] h-8 bg-pearl origin-top"
          animate={{ scaleY: [0, 1, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </section>
  )
}
