import { useState, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { fadeUp, viewportOnce } from '../lib/animations'

export default function RoiCalc() {
  const [employees, setEmployees] = useState(5)
  const [hoursPerWeek, setHoursPerWeek] = useState(15)
  const [hourlyRate, setHourlyRate]     = useState(28)

  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  const weeklyLoss  = employees * hoursPerWeek * hourlyRate
  const yearlyLoss  = weeklyLoss * 52
  const aiSaving    = Math.round(yearlyLoss * 0.65)
  const monthlySub  = 1497
  const netAnnual   = aiSaving - (monthlySub * 12)
  const payback     = Math.round((monthlySub * 12) / (aiSaving / 12))

  const fmt = (n) => n.toLocaleString('fr-CA')

  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="mb-16"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="copper-line w-10" />
            <span className="label-caps">Calculateur ROI</span>
          </div>
          <h2
            className="display-heading max-w-xl"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            Calculez votre
            <br />
            <em>retour sur investissement</em>
          </h2>
        </motion.div>

        <motion.div
          className="grid lg:grid-cols-2 gap-8"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          transition={{ delay: 0.15 }}
        >
          {/* Sliders */}
          <div className="glass-card p-8 space-y-10">
            {[
              {
                label: 'Employés concernés par les tâches répétitives',
                value: employees,
                setValue: setEmployees,
                min: 1, max: 50, step: 1,
                display: `${employees} employé${employees > 1 ? 's' : ''}`,
              },
              {
                label: 'Heures/semaine consacrées à ces tâches (par employé)',
                value: hoursPerWeek,
                setValue: setHoursPerWeek,
                min: 1, max: 40, step: 1,
                display: `${hoursPerWeek} h/sem.`,
              },
              {
                label: 'Taux horaire moyen',
                value: hourlyRate,
                setValue: setHourlyRate,
                min: 18, max: 80, step: 1,
                display: `${hourlyRate} $/h`,
              },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm text-pearl/70 font-sans">{s.label}</label>
                  <span className="font-display italic text-lg text-copper-light">{s.display}</span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={s.value}
                  onChange={(e) => s.setValue(Number(e.target.value))}
                  className="w-full"
                  aria-label={s.label}
                />
                <div className="flex justify-between text-[0.65rem] text-dim mt-1">
                  <span>{s.min}</span>
                  <span>{s.max}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Results */}
          <div className="flex flex-col gap-4">
            <div
              className="glass-card p-8 flex-1"
              style={{ borderTop: '0.5px solid var(--copper)' }}
            >
              <p className="label-caps mb-8">Votre projection annuelle</p>

              <div className="space-y-6">
                {[
                  { label: 'Coût actuel des tâches répétitives', value: `${fmt(yearlyLoss)} $`, negative: true },
                  { label: 'Économies avec Novalis IA (−65%)', value: `${fmt(aiSaving)} $`, highlight: true },
                  { label: 'Abonnement annuel (forfait Pro)', value: `${fmt(monthlySub * 12)} $`, negative: true },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center">
                    <span className="text-sm text-dim">{row.label}</span>
                    <span
                      className="font-display italic text-xl"
                      style={{
                        color: row.highlight
                          ? 'var(--copper-light)'
                          : row.negative
                          ? 'rgba(237,232,223,0.5)'
                          : 'var(--pearl)',
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}

                <div
                  className="pt-6"
                  style={{ borderTop: '0.5px solid rgba(237,232,223,0.1)' }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-pearl font-medium">Gain net annuel</span>
                    <span
                      className="font-display italic"
                      style={{ fontSize: '2.5rem', color: netAnnual > 0 ? 'var(--copper-light)' : 'rgba(237,232,223,0.5)' }}
                    >
                      {fmt(Math.max(0, netAnnual))} $
                    </span>
                  </div>
                  <p className="text-xs text-dim mt-2">
                    Retour sur investissement estimé en <strong className="text-pearl">{payback} mois</strong>
                  </p>
                </div>
              </div>
            </div>

            <a href="#contact" className="btn-copper text-center inline-flex items-center justify-center gap-2">
              Valider ces chiffres avec notre équipe
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
