import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { ArrowRight, Star } from 'lucide-react'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

// Honest early-adopter section — no fake testimonials

const perks = [
  {
    title: 'Tarif fondateur',
    desc: 'Les 10 premiers clients bénéficient d\'un tarif bloqué à vie — quel que soit l\'évolution de nos prix.',
  },
  {
    title: 'Intégration prioritaire',
    desc: 'Votre projet passe en tête de file. Mise en production en 2 semaines au lieu de 4.',
  },
  {
    title: 'Influence sur le produit',
    desc: 'Vos besoins façonnent directement nos prochaines fonctionnalités. Accès direct à notre équipe fondatrice.',
  },
  {
    title: 'Garantie ROI étendue',
    desc: 'Si votre ROI n\'est pas positif à 60 jours, on rembourse 100% — sans conditions, sans questions.',
  },
]

export default function Testimonials() {
  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section ref={ref} className="relative py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">

        {/* Header */}
        <motion.div
          className="grid lg:grid-cols-12 gap-8 mb-14"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <div className="lg:col-span-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="copper-line w-10" />
              <span className="label-caps">Offre de lancement</span>
            </div>
            <h2
              className="display-heading"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
            >
              Rejoignez les
              <br />
              <em>10 premiers clients</em>
            </h2>
          </div>
          <div className="lg:col-span-5 lg:col-start-8 self-end">
            <p className="text-dim leading-relaxed text-sm">
              Novalis IA est en phase de lancement. Pas de faux témoignages, pas de clients inventés.
              Ce qu'on offre à la place : un deal fondateur exceptionnel pour les entreprises qui nous
              font confiance en premier.
            </p>
          </div>
        </motion.div>

        {/* Perks grid */}
        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {perks.map((p, i) => (
            <motion.div
              key={p.title}
              variants={fadeUp}
              className="glass-card p-7 group"
            >
              <div
                className="absolute top-0 left-0 w-6 h-[0.5px] transition-all duration-500 group-hover:w-full"
                style={{ background: 'var(--copper)' }}
              />
              <div
                className="font-display italic text-4xl mb-4 leading-none"
                style={{ color: 'rgba(40,96,232,0.25)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="text-pearl font-sans font-medium text-sm mb-2">{p.title}</h3>
              <p className="text-dim text-xs leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA band */}
        <motion.div
          className="glass-card p-8 flex flex-col sm:flex-row items-center justify-between gap-6"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          transition={{ delay: 0.3 }}
          style={{ borderTop: '0.5px solid var(--copper)' }}
        >
          <div>
            <div className="flex items-center gap-2 mb-2">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={10} style={{ fill: 'var(--copper)', color: 'var(--copper)' }} />
              ))}
              <span className="text-xs text-dim ml-1">Ce que vous méritez d'un partenaire IA</span>
            </div>
            <p className="font-display italic text-xl text-pearl">
              Places limitées — <span style={{ color: 'var(--copper-light)' }}>offre valide jusqu'à ce qu'elles soient comblées</span>
            </p>
          </div>
          <a
            href="#contact"
            className="btn-copper shrink-0 inline-flex items-center gap-2"
          >
            Réclamer ma place
            <ArrowRight size={13} />
          </a>
        </motion.div>
      </div>
    </section>
  )
}
