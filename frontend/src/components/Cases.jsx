import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { fadeUp, fadeLeft, stagger, viewportOnce } from '../lib/animations'

const cases = [
  {
    industry: 'Distribution',
    company: 'Groupe Rioux Distribution',
    challenge: 'Service client débordé, 200+ appels/jour, 4 agents à temps plein.',
    solution: 'Assistant vocal IA + chatbot WhatsApp intégré à leur ERP.',
    results: [
      { metric: '80%', label: 'des demandes résolues sans agent' },
      { metric: '-62%', label: 'coûts de service client' },
      { metric: '< 1 s', label: 'temps de réponse moyen' },
    ],
  },
  {
    industry: 'Immobilier',
    company: 'Immobilier Côte-Nord',
    challenge: 'Qualification manuelle des leads, 40% des appels non pertinents.',
    solution: 'IA de qualification téléphonique + scoring CRM automatisé.',
    results: [
      { metric: '+340%', label: 'leads qualifiés/mois' },
      { metric: '-40%', label: 'temps agents sur qualification' },
      { metric: '22 j', label: 'ROI atteint' },
    ],
  },
  {
    industry: 'Services professionnels',
    company: 'Cabinet Tremblay & Associés',
    challenge: 'Traitement manuel de 500 documents juridiques par semaine.',
    solution: 'Pipeline d\'extraction IA + validation automatique + routage.',
    results: [
      { metric: '90%', label: 'documents traités automatiquement' },
      { metric: '8h → 40 min', label: 'temps de traitement hebdo' },
      { metric: '0 erreur', label: 'sur 12 semaines d\'opération' },
    ],
  },
]

export default function Cases() {
  const ref = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section id="cases" ref={ref} className="relative py-32 overflow-hidden">
      <span className="section-number top-0 left-[-1rem]" aria-hidden="true">04</span>

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="grid lg:grid-cols-12 gap-8 mb-20"
          variants={fadeLeft}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <div className="lg:col-span-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="copper-line w-10" />
              <span className="label-caps">Cas clients</span>
            </div>
            <h2
              className="display-heading"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
            >
              Des résultats
              <br />
              <em>documentés</em>
            </h2>
          </div>
        </motion.div>

        <motion.div
          className="grid lg:grid-cols-3 gap-6"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {cases.map((c, i) => (
            <motion.article
              key={c.company}
              variants={fadeUp}
              className="glass-card relative overflow-hidden group flex flex-col"
              style={{ paddingTop: '2.5rem' }}
            >
              {/* Top accent */}
              <div
                className="absolute top-0 left-0 right-0 h-[0.5px]"
                style={{ background: 'linear-gradient(90deg, var(--copper) 30%, transparent 100%)' }}
              />

              <div className="px-8 pb-0 flex-1">
                <span className="label-caps block mb-4">{c.industry}</span>
                <h3 className="font-display italic text-xl text-pearl mb-5 leading-tight">
                  {c.company}
                </h3>

                <div className="space-y-4 text-sm mb-6">
                  <div>
                    <div className="text-[0.6rem] tracking-widest uppercase text-dim mb-1">Défi</div>
                    <p className="text-pearl/70">{c.challenge}</p>
                  </div>
                  <div>
                    <div className="text-[0.6rem] tracking-widest uppercase text-dim mb-1">Solution</div>
                    <p className="text-pearl/70">{c.solution}</p>
                  </div>
                </div>
              </div>

              {/* Results bar */}
              <div
                className="mt-auto px-8 py-6 grid grid-cols-3 gap-3"
                style={{ borderTop: '0.5px solid rgba(237,232,223,0.06)' }}
              >
                {c.results.map((r) => (
                  <div key={r.label} className="text-center">
                    <div className="font-display italic text-lg text-copper-light leading-none mb-1">
                      {r.metric}
                    </div>
                    <div className="text-[0.55rem] tracking-wider uppercase text-dim leading-tight">
                      {r.label}
                    </div>
                  </div>
                ))}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
