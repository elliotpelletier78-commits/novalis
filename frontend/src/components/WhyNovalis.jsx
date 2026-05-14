import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

const rows = [
  { feature: "Tarif d'entrée",          novalis: "497 $/mois",                  agency: "3 500$ à 10 000$" },
  { feature: "Mise en place",           novalis: "48 heures",                   agency: "3 à 6 mois" },
  { feature: "Agent vocal IA",          novalis: true,                          agency: false },
  { feature: "Essai gratuit 7 jours",   novalis: true,                          agency: false },
  { feature: "Données au Canada",       novalis: true,                          agency: null },
  { feature: "Engagement",             novalis: "Mensuel, annulable",           agency: "Annuel obligatoire" },
  { feature: "Conformité Loi 25",       novalis: true,                          agency: null },
]

function Cell({ val, isNovalis }) {
  if (val === true)
    return <Check size={15} style={{ color: isNovalis ? 'var(--copper)' : 'var(--dim)' }} />
  if (val === false)
    return <X size={15} style={{ color: '#6B7280' }} />
  if (val === null)
    return <span className="text-dim text-xs">Variable</span>
  return <span className={`text-sm font-sans ${isNovalis ? 'text-pearl font-medium' : 'text-dim'}`}>{val}</span>
}

export default function WhyNovalis() {
  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      <div className="max-w-5xl mx-auto px-6">

        <motion.div
          className="text-center mb-14"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="copper-line w-10" />
            <span className="label-caps">Pourquoi pas une agence ?</span>
            <div className="w-10 h-[0.5px] bg-gradient-to-l from-copper to-transparent" />
          </div>
          <h2
            className="display-heading"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)' }}
          >
            Résultats en 48h,
            <br />
            <em>pas en 6 mois</em>
          </h2>
          <p className="text-dim max-w-xl mx-auto mt-5 text-sm leading-relaxed">
            Les grandes agences IA facturent l'analyse avant même de commencer. Novalis déploie, mesure et
            prouve — puis vous facture seulement si vous êtes satisfait.
          </p>
        </motion.div>

        {/* Comparison table */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          transition={{ delay: 0.15 }}
        >
          <div className="glass-card overflow-hidden">
            {/* Top copper accent */}
            <div
              className="h-[0.5px]"
              style={{ background: 'linear-gradient(90deg, transparent, var(--copper), transparent)' }}
            />

            {/* Header row */}
            <div className="grid grid-cols-3 px-8 py-5" style={{ borderBottom: '0.5px solid rgba(11,26,46,0.08)' }}>
              <div />
              <div className="text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1" style={{ background: 'rgba(40,96,232,0.12)', border: '0.5px solid rgba(40,96,232,0.3)' }}>
                  <span className="font-display italic text-base text-pearl">Novalis</span>
                  <span className="text-[0.55rem] tracking-widest uppercase text-copper">IA</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-[0.65rem] tracking-widest uppercase text-dim">Agence traditionnelle</span>
              </div>
            </div>

            {/* Data rows */}
            {rows.map((row, i) => (
              <div
                key={row.feature}
                className="grid grid-cols-3 px-8 py-4 items-center transition-colors duration-200 hover:bg-black/[0.02]"
                style={{ borderBottom: i < rows.length - 1 ? '0.5px solid rgba(11,26,46,0.06)' : undefined }}
              >
                <span className="text-xs tracking-wide text-dim font-sans">{row.feature}</span>
                <div className="flex justify-center">
                  <Cell val={row.novalis} isNovalis />
                </div>
                <div className="flex justify-center">
                  <Cell val={row.agency} isNovalis={false} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.p
          className="text-center text-dim text-xs mt-8 tracking-wide"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          transition={{ delay: 0.3 }}
        >
          Essai gratuit 7 jours · Aucune carte de crédit · Annulable en tout temps
        </motion.p>
      </div>
    </section>
  )
}
