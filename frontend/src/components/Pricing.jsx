import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, ArrowRight } from 'lucide-react'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

const plans = [
  {
    name:   'Starter',
    plan:   'starter',
    price:  '497',
    period: '/mois',
    desc:   'Pour les PME qui démarrent leur transformation IA.',
    features: [
      '1 assistant IA configuré',
      "Jusqu'à 500 interactions/mois",
      'Intégration site web ou téléphone',
      'Tableau de bord basique',
      'Support par courriel',
      'Rapport mensuel',
    ],
    cta:       'Commencer',
    highlight: false,
  },
  {
    name:   'Pro',
    plan:   'pro',
    price:  '1 497',
    period: '/mois',
    desc:   'Pour les entreprises qui veulent maximiser leur ROI IA.',
    features: [
      '3 assistants IA configurés',
      'Interactions illimitées',
      'Intégrations CRM & ERP',
      'Tableau de bord avancé + analytics',
      'Support prioritaire 7j/7',
      'Rapports hebdomadaires',
      'Optimisation continue incluse',
      'Accès API complet',
    ],
    cta:       'Choisir Pro',
    highlight: true,
  },
  {
    name:   'Entreprise',
    plan:   'enterprise',
    price:  null,
    period: 'sur mesure',
    desc:   'Pour les grandes organisations avec des besoins complexes.',
    features: [
      'Assistants IA illimités',
      'Infrastructure dédiée',
      'Intégrations systèmes propriétaires',
      'SLA garanti 99,9%',
      'Équipe dédiée',
      'Formation de vos équipes',
      'Conformité RGPD / Loi 25',
      "Tarification à l'usage possible",
    ],
    cta:       'Nous contacter',
    highlight: false,
  },
]

export default function Pricing() {
  const ref = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section id="pricing" ref={ref} className="relative py-32 overflow-hidden">
      <span className="section-number top-0 left-[-1rem]" aria-hidden="true">07</span>

      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="text-center mb-16"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="copper-line w-10" />
            <span className="label-caps">Tarifs transparents</span>
            <div className="w-10 h-[0.5px] bg-gradient-to-l from-copper to-transparent" />
          </div>
          <h2
            className="display-heading"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            Investissement calculé,
            <br />
            <em>ROI garanti</em>
          </h2>
          <p className="text-dim max-w-lg mx-auto mt-4">
            Pas de frais cachés. Pas d'engagement annuel obligatoire. Annulable en tout temps.
          </p>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-3 gap-4 items-stretch"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {plans.map((plan) => (
            <motion.div
              key={plan.name}
              variants={fadeUp}
              className={`relative flex flex-col ${
                plan.highlight
                  ? 'glass-card shadow-copper-glow'
                  : 'glass-card-subtle pearl-border'
              }`}
            >
              {plan.highlight && (
                <>
                  {/* Top copper bar */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[0.5px]"
                    style={{ background: 'linear-gradient(90deg, transparent, var(--copper), transparent)' }}
                  />
                  {/* Featured badge */}
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 text-[0.6rem] tracking-widest uppercase"
                    style={{
                      background: 'var(--copper)',
                      color: 'var(--pearl)',
                      border: '0.5px solid var(--copper-light)',
                    }}
                  >
                    Recommandé
                  </div>
                </>
              )}

              <div className="p-8 flex-1 flex flex-col">
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display italic text-2xl text-pearl">{plan.name}</h3>
                    {plan.price && (
                      <span className="text-[0.58rem] tracking-widest uppercase px-2 py-0.5" style={{ background: 'rgba(74,195,111,0.12)', color: '#4ac36f', border: '0.5px solid rgba(74,195,111,0.3)' }}>
                        7 jours gratuit
                      </span>
                    )}
                  </div>
                  <p className="text-dim text-sm">{plan.desc}</p>
                </div>

                {/* Price */}
                <div
                  className="mb-8 pb-8"
                  style={{ borderBottom: '0.5px solid rgba(11,26,46,0.08)' }}
                >
                  {plan.price ? (
                    <div className="flex items-end gap-2">
                      <span
                        className="font-display italic leading-none"
                        style={{
                          fontSize: '3.5rem',
                          color: plan.highlight ? 'var(--copper-light)' : 'var(--pearl)',
                        }}
                      >
                        {plan.price}$
                      </span>
                      <span className="text-dim text-sm pb-2">{plan.period}</span>
                    </div>
                  ) : (
                    <div
                      className="font-display italic leading-none"
                      style={{ fontSize: '2.5rem', color: 'var(--pearl)' }}
                    >
                      Sur mesure
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="flex-1 space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm">
                      <Check
                        size={13}
                        className="shrink-0 mt-0.5"
                        style={{ color: plan.highlight ? 'var(--copper)' : 'var(--dim)' }}
                      />
                      <span className="text-pearl/75">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <a
                  href={`#contact?plan=${plan.plan}`}
                  className={`inline-flex items-center justify-center gap-2 ${
                    plan.highlight ? 'btn-copper' : 'btn-ghost'
                  }`}
                >
                  {plan.cta}
                  <ArrowRight size={13} />
                </a>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Trust note */}
        <motion.p
          className="text-center text-dim text-xs mt-10 tracking-wide"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          transition={{ delay: 0.4 }}
        >
          Tous les prix en CAD · Aucun engagement · Garantie satisfait ou remboursé 30 jours
        </motion.p>
      </div>
    </section>
  )
}
