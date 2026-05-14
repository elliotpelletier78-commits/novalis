import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { fadeUp, fadeLeft, stagger, viewportOnce } from '../lib/animations'

// Honest section: shows what a typical mandate looks like without fake clients

const mandates = [
  {
    type: 'Service client',
    challenge: 'Votre équipe passe la moitié de sa journée à répondre aux mêmes 20 questions.',
    whatWeDo: 'On configure un assistant IA qui répond aux demandes courantes 24/7 et transfère les cas complexes à votre équipe avec le contexte complet.',
    outcomes: [
      'Volume d\'appels entrants réduit de 50 à 80%',
      'Réponse instantanée, même la nuit et les weekends',
      'Vos agents se concentrent sur les vrais problèmes',
    ],
  },
  {
    type: 'Qualification de leads',
    challenge: 'Vous perdez du temps sur des prospects non qualifiés ou vous ratez des opportunités parce que personne ne rappelle assez vite.',
    whatWeDo: 'On déploie un agent qui contacte, qualifie et pré-classe chaque lead en moins de 5 minutes après sa soumission, en tout temps.',
    outcomes: [
      'Temps de réponse : de 4h à moins de 5 minutes',
      'Leads qualifiés livrés directement dans votre CRM',
      'Aucun prospect ne passe entre les mailles',
    ],
  },
  {
    type: 'Traitement de documents',
    challenge: 'Vos équipes saisissent manuellement des données depuis des bons de commande, factures ou formulaires — lentement et avec des erreurs.',
    whatWeDo: 'On automatise l\'extraction, la validation et le routage des documents dans vos systèmes existants sans intervention humaine.',
    outcomes: [
      '80 à 95% des documents traités automatiquement',
      'Taux d\'erreur proche de zéro',
      'Intégration directe à votre ERP ou comptabilité',
    ],
  },
]

export default function Cases() {
  const ref    = useRef(null)
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
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-6">
              <div className="copper-line w-10" />
              <span className="label-caps">Ce qu'on fait concrètement</span>
            </div>
            <h2
              className="display-heading"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
            >
              À quoi ressemble
              <br />
              <em>un mandat type</em>
            </h2>
            <p className="text-dim text-sm mt-6 max-w-lg leading-relaxed">
              Pas de promesses vagues. Voici exactement ce que nous livrons, selon votre situation.
              Chaque mandat commence par un audit gratuit pour valider que le ROI est réel.
            </p>
          </div>
        </motion.div>

        <motion.div
          className="grid lg:grid-cols-3 gap-6"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {mandates.map((m) => (
            <motion.article
              key={m.type}
              variants={fadeUp}
              className="glass-card flex flex-col"
            >
              <div
                className="absolute top-0 left-0 right-0 h-[0.5px]"
                style={{ background: 'linear-gradient(90deg, var(--copper) 30%, transparent 100%)' }}
              />

              <div className="p-8 flex-1 flex flex-col">
                <span className="label-caps block mb-4">{m.type}</span>

                <div className="mb-5">
                  <div className="text-[0.6rem] tracking-widest uppercase text-dim mb-2">Situation typique</div>
                  <p className="text-pearl/70 text-sm leading-relaxed italic font-display text-lg">
                    "{m.challenge}"
                  </p>
                </div>

                <div className="mb-6">
                  <div className="text-[0.6rem] tracking-widest uppercase text-dim mb-2">Ce qu'on déploie</div>
                  <p className="text-pearl/75 text-sm leading-relaxed">{m.whatWeDo}</p>
                </div>

                <div
                  className="mt-auto pt-6"
                  style={{ borderTop: '0.5px solid rgba(237,232,223,0.06)' }}
                >
                  <div className="text-[0.6rem] tracking-widest uppercase text-dim mb-3">Résultats attendus</div>
                  <ul className="space-y-2">
                    {m.outcomes.map((o) => (
                      <li key={o} className="flex items-start gap-2 text-xs text-pearl/70">
                        <span style={{ color: 'var(--copper)', marginTop: '1px' }}>→</span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>

        {/* Honest note */}
        <motion.div
          className="mt-10 glass-card-subtle pearl-border p-6 flex items-start gap-4"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          transition={{ delay: 0.4 }}
        >
          <div
            className="shrink-0 w-5 h-5 flex items-center justify-center text-xs mt-0.5"
            style={{ border: '0.5px solid rgba(40,96,232,0.4)', color: 'var(--copper)' }}
          >
            i
          </div>
          <p className="text-dim text-sm leading-relaxed">
            <span className="text-pearl">Novalis IA est en phase de lancement.</span> Ces résultats sont basés sur des benchmarks
            sectoriels et les standards de l'industrie IA — pas sur des témoignages inventés.
            Votre audit gratuit établira des projections honnêtes adaptées à votre situation réelle.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
