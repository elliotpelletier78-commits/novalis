import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

function useCounter(target, duration = 2000, start = false) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!start) return
    let startTime = null
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration, start])

  return count
}

const stats = [
  { value: 40,    suffix: '+',  label: 'Entreprises québécoises', desc: 'clients actifs' },
  { value: 180,   suffix: 'k$', label: 'Économisés par client/an', desc: 'en moyenne' },
  { value: 30,    suffix: 'j',  label: 'Premier ROI mesurable', desc: 'délai moyen' },
  { value: 4.9,   suffix: '/5', label: 'Satisfaction client', desc: '148 évaluations' },
]

function StatCard({ stat, index, started }) {
  const isFloat = stat.value % 1 !== 0
  const count = useCounter(isFloat ? stat.value * 10 : stat.value, 2000 + index * 200, started)
  const display = isFloat ? (count / 10).toFixed(1) : count

  return (
    <motion.div
      variants={fadeUp}
      className="glass-card p-8 relative overflow-hidden group hover:border-copper transition-all duration-500"
      style={{ borderColor: 'rgba(168,104,68,0.15)' }}
    >
      <div
        className="absolute top-0 left-0 w-12 h-[0.5px] transition-all duration-500 group-hover:w-full"
        style={{ background: 'var(--copper)' }}
      />
      <div
        className="font-display italic mb-2"
        style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', color: 'var(--copper-light)', lineHeight: 1 }}
      >
        {display}{stat.suffix}
      </div>
      <div className="text-pearl font-sans font-medium text-sm mb-1">{stat.label}</div>
      <div className="text-dim text-xs tracking-wider uppercase">{stat.desc}</div>
    </motion.div>
  )
}

export default function Stats() {
  const ref = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section
      ref={ref}
      className="relative py-24 -mt-20 z-10"
      aria-label="Statistiques clés"
    >
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {stats.map((stat, i) => (
            <StatCard key={stat.label} stat={stat} index={i} started={inView} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
