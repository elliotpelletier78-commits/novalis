import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Shield, Clock, TrendingUp, Zap } from 'lucide-react'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

const promises = [
  {
    icon: Clock,
    value: '30 jours',
    label: 'Premier ROI mesurable',
    desc: 'Garanti contractuellement ou remboursement complet.',
    copper: true,
  },
  {
    icon: TrendingUp,
    value: '−40 à 80%',
    label: 'Réduction des coûts opérationnels',
    desc: 'Estimé personnalisé fourni lors de l\'audit gratuit.',
    copper: false,
  },
  {
    icon: Zap,
    value: '< 1 seconde',
    label: 'Temps de réponse IA',
    desc: 'Disponible 24h/24, 7j/7, sans file d\'attente.',
    copper: false,
  },
  {
    icon: Shield,
    value: '100%',
    label: 'Données au Canada',
    desc: 'Conformité Loi 25 et RGPD assurée, sans compromis.',
    copper: false,
  },
]

export default function Stats() {
  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section ref={ref} className="relative py-24 -mt-20 z-10" aria-label="Nos engagements">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {promises.map((p) => {
            const Icon = p.icon
            return (
              <motion.div
                key={p.label}
                variants={fadeUp}
                className="glass-card p-7 group hover:shadow-copper-glow transition-all duration-500"
              >
                <div
                  className="absolute top-0 left-0 w-8 h-[0.5px] group-hover:w-full transition-all duration-500"
                  style={{ background: 'var(--copper)' }}
                />
                <Icon size={16} className="mb-4" style={{ color: 'var(--copper)' }} />
                <div
                  className="font-display italic mb-2 leading-none"
                  style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', color: p.copper ? 'var(--copper-light)' : 'var(--pearl)' }}
                >
                  {p.value}
                </div>
                <div className="text-pearl text-sm font-medium mb-2">{p.label}</div>
                <p className="text-dim text-xs leading-relaxed">{p.desc}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
