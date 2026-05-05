import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

const steps = [
  {
    num: '01',
    title: 'Audit & diagnostic',
    desc: 'Nous cartographions vos processus, identifions les opportunités d\'automatisation et calculons le ROI potentiel de chaque intervention.',
    duration: '1–2 jours',
  },
  {
    num: '02',
    title: 'Configuration & intégration',
    desc: 'Notre équipe configure l\'IA selon vos flux, l\'intègre à vos outils existants et forme les premières réponses sur vos données réelles.',
    duration: '1–3 semaines',
  },
  {
    num: '03',
    title: 'Tests & ajustements',
    desc: 'Phase de rodage supervisée : nous affinons les modèles, corrigeons les cas limites et validons la performance avec vos équipes.',
    duration: '1 semaine',
  },
  {
    num: '04',
    title: 'Mise en production',
    desc: 'Déploiement progressif, monitoring en temps réel et tableau de bord dédié. Votre IA est en ligne, mesurée, optimisée en continu.',
    duration: 'Continu',
  },
]

export default function Process() {
  const ref = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      <span className="section-number top-0 right-[-1rem]" aria-hidden="true">03</span>

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="mb-16"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="copper-line w-10" />
            <span className="label-caps">Notre méthode</span>
          </div>
          <h2
            className="display-heading max-w-xl"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            De l'idée au
            <br />
            <em>résultat en 30 jours</em>
          </h2>
        </motion.div>

        <motion.div
          className="relative"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {/* Vertical line */}
          <div
            className="absolute left-[1.35rem] top-4 bottom-4 hidden md:block"
            style={{ width: '0.5px', background: 'rgba(168,104,68,0.2)' }}
          />

          <div className="flex flex-col gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                variants={fadeUp}
                className="grid md:grid-cols-12 gap-6 items-start group"
              >
                {/* Step number dot */}
                <div className="md:col-span-1 flex justify-start md:justify-center pt-1">
                  <div
                    className="w-[2.7rem] h-[2.7rem] flex items-center justify-center text-xs font-sans tracking-widest transition-colors duration-300 z-10"
                    style={{
                      border: '0.5px solid rgba(168,104,68,0.4)',
                      background: 'var(--obsidian)',
                      color: 'var(--copper)',
                    }}
                  >
                    {step.num}
                  </div>
                </div>

                {/* Content */}
                <div className="md:col-span-9 glass-card-subtle pearl-border p-7 group-hover:border-copper/20 transition-all duration-500">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <h3 className="font-display italic text-2xl text-pearl">{step.title}</h3>
                    <span
                      className="text-[0.65rem] tracking-widest uppercase px-3 py-1 shrink-0"
                      style={{ border: '0.5px solid rgba(168,104,68,0.25)', color: 'var(--copper)' }}
                    >
                      {step.duration}
                    </span>
                  </div>
                  <p className="text-dim text-sm leading-relaxed mt-3">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
