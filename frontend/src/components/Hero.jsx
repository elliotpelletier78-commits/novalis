import { useRef, useEffect, useState } from 'react'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { stagger, fadeUp, blurIn } from '../lib/animations'

export default function Hero() {
  const ref        = useRef(null)
  const [ready, setReady] = useState(false)

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const smooth = useSpring(scrollYProgress, { stiffness: 60, damping: 20 })

  // Parallax layers at different speeds
  const y1 = useTransform(smooth, [0, 1], ['0%',  '-18%'])  // headline
  const y2 = useTransform(smooth, [0, 1], ['0%',  '-10%'])  // sub
  const y3 = useTransform(smooth, [0, 1], ['0%',  '-5%'])   // ctas
  const opacity = useTransform(smooth, [0, 0.6], [1, 0])

  useEffect(() => { setReady(true) }, [])

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex flex-col justify-end pb-24 pt-36 overflow-hidden"
      aria-label="Introduction"
    >
      {/* Atmospheric gradient */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 60% 30%, rgba(168,104,68,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* Horizontal hairline */}
      <motion.div
        aria-hidden="true"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
        style={{
          position: 'absolute', top: '38%', left: 0, right: 0,
          height: '0.5px',
          background: 'linear-gradient(90deg, transparent 0%, rgba(168,104,68,0.18) 40%, rgba(168,104,68,0.18) 60%, transparent 100%)',
          transformOrigin: 'left',
        }}
      />

      {/* Section number watermark */}
      <span className="section-number top-12 right-[-1rem]" aria-hidden="true">01</span>

      <div className="max-w-7xl mx-auto px-6 w-full">

        {/* Label row */}
        <motion.div
          style={{ y: y3, opacity }}
          className="flex items-center gap-3 mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          <div className="copper-line w-10" />
          <span className="label-caps">Intelligence artificielle · Québec</span>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse ml-2" />
          <span className="text-[0.6rem] text-dim tracking-wider">Disponible maintenant</span>
        </motion.div>

        {/* Main headline — parallax layer 1 */}
        <motion.div style={{ y: ready ? y1 : 0, opacity }}>
          <motion.h1
            className="display-heading mb-0"
            style={{ fontSize: 'clamp(4rem, 11vw, 10.5rem)', lineHeight: 0.92 }}
            initial={{ opacity: 0, y: 60, filter: 'blur(16px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          >
            Vos processus
          </motion.h1>
          <motion.h1
            className="display-heading"
            style={{
              fontSize: 'clamp(4rem, 11vw, 10.5rem)',
              lineHeight: 0.92,
              color: 'var(--copper-light)',
              marginLeft: 'clamp(1rem, 4vw, 5rem)',
            }}
            initial={{ opacity: 0, y: 60, filter: 'blur(16px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
          >
            automatisés.
          </motion.h1>
          <motion.h1
            className="display-heading"
            style={{ fontSize: 'clamp(4rem, 11vw, 10.5rem)', lineHeight: 0.92 }}
            initial={{ opacity: 0, y: 60, filter: 'blur(16px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.38 }}
          >
            Votre croissance
          </motion.h1>
          <motion.h1
            className="display-heading"
            style={{
              fontSize: 'clamp(4rem, 11vw, 10.5rem)',
              lineHeight: 0.92,
              marginLeft: 'clamp(2rem, 8vw, 12rem)',
              fontStyle: 'italic',
            }}
            initial={{ opacity: 0, y: 60, filter: 'blur(16px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.48 }}
          >
            amplifiée.
          </motion.h1>
        </motion.div>

        {/* Sub + CTAs — parallax layer 2/3 */}
        <motion.div
          style={{ y: ready ? y2 : 0, opacity }}
          className="mt-14 grid lg:grid-cols-12 gap-8"
        >
          <motion.p
            className="lg:col-span-4 text-dim leading-relaxed"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65 }}
          >
            Novalis IA intègre l'intelligence artificielle directement dans vos opérations —
            assistants vocaux, chatbots, automatisation documentaire — avec des résultats
            mesurables dès les premières semaines.
          </motion.p>

          <motion.div
            style={{ y: ready ? y3 : 0 }}
            className="lg:col-span-4 lg:col-start-9 flex flex-col gap-3 justify-end"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.78 }}
          >
            <a href="#contact" className="btn-copper inline-flex items-center justify-center gap-2">
              Consultation gratuite — 30 min
              <ArrowRight size={14} />
            </a>
            <a href="#demo" className="btn-ghost inline-flex items-center justify-center gap-2">
              Voir la démo live
            </a>
          </motion.div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.35 }}
        transition={{ delay: 1.4 }}
        aria-hidden="true"
      >
        <span className="text-[0.58rem] tracking-[0.25em] uppercase font-sans text-pearl">Défiler</span>
        <motion.div
          style={{ width: '0.5px', height: '32px', background: 'var(--pearl)', transformOrigin: 'top' }}
          animate={{ scaleY: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </section>
  )
}
