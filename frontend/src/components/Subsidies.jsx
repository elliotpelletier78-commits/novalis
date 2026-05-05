import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

const subsidies = [
  {
    org: 'Investissement Québec',
    name: 'ESSOR — Volet numérique',
    amount: "Jusqu'à 50%",
    desc: "Financement des projets de transformation numérique des entreprises québécoises.",
  },
  {
    org: 'CDPQ / MEI',
    name: 'Crédit d\'impôt CTAI',
    amount: 'Jusqu\'à 30%',
    desc: "Crédit d'impôt pour la technologie de l'information applicable à l'IA.",
  },
  {
    org: 'Fédéral — ISDE',
    name: 'Programme CanExport PME',
    amount: 'Jusqu\'à 75 000$',
    desc: "Pour les entreprises qui utilisent l'IA dans leurs activités d'exportation.",
  },
]

export default function Subsidies() {
  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section ref={ref} className="relative py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-12 gap-12 items-center">

          <motion.div
            className="lg:col-span-4"
            variants={fadeUp}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="copper-line w-10" />
              <span className="label-caps">Subventions disponibles</span>
            </div>
            <h2
              className="display-heading"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              Réduisez
              <br />
              votre coût
              <br />
              <em>réel</em>
            </h2>
            <p className="text-dim text-sm leading-relaxed mt-6">
              De nombreuses entreprises québécoises peuvent récupérer 30 à 75 % de leur
              investissement IA grâce aux programmes existants. Notre équipe vous guide.
            </p>
          </motion.div>

          <motion.div
            className="lg:col-span-7 lg:col-start-6 space-y-4"
            variants={stagger}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            {subsidies.map((s) => (
              <motion.div
                key={s.name}
                variants={fadeUp}
                className="glass-card-subtle pearl-border p-6 flex items-start justify-between gap-6 hover:border-copper/25 transition-all duration-300"
              >
                <div className="flex-1">
                  <div className="label-caps mb-1">{s.org}</div>
                  <h3 className="font-display italic text-xl text-pearl mb-2">{s.name}</h3>
                  <p className="text-dim text-sm">{s.desc}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className="font-display italic text-2xl leading-none"
                    style={{ color: 'var(--copper-light)' }}
                  >
                    {s.amount}
                  </div>
                  <div className="text-[0.6rem] tracking-widest uppercase text-dim mt-1">remboursé</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
