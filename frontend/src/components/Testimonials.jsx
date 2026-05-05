import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

const testimonials = [
  {
    quote: "Notre coût de service client a baissé de 62 % en deux mois. Novalis a livré exactement ce qu'ils avaient promis, dans les délais annoncés.",
    name: "Marie Rioux",
    title: "DG, Groupe Rioux Distribution",
    initials: "MR",
  },
  {
    quote: "Le ROI était au rendez-vous dès la troisième semaine. Notre équipe commerciale passe maintenant son temps sur de vrais prospects, pas à qualifier des appels.",
    name: "Jean-François Côté",
    title: "Directeur commercial, Immobilier Côte-Nord",
    initials: "JC",
  },
  {
    quote: "Nous traitions 500 documents par semaine manuellement. Aujourd'hui, 90 % sont traités automatiquement avec zéro erreur. C'est transformateur.",
    name: "Sylvie Tremblay",
    title: "Associée, Cabinet Tremblay & Associés",
    initials: "ST",
  },
]

export default function Testimonials() {
  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section ref={ref} className="relative py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="mb-14"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="copper-line w-10" />
            <span className="label-caps">Témoignages</span>
          </div>
          <h2
            className="display-heading max-w-lg"
            style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
          >
            Ils ont fait
            <br />
            <em>confiance à Novalis</em>
          </h2>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-3 gap-4"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {testimonials.map((t) => (
            <motion.figure
              key={t.name}
              variants={fadeUp}
              className="glass-card p-8 flex flex-col"
            >
              <div
                className="absolute top-0 left-0 right-0 h-[0.5px]"
                style={{ background: 'linear-gradient(90deg, var(--copper) 0%, transparent 100%)' }}
              />

              <blockquote className="font-display italic text-lg text-pearl leading-relaxed flex-1 mb-6">
                "{t.quote}"
              </blockquote>

              <figcaption className="flex items-center gap-3">
                <div
                  className="w-10 h-10 flex items-center justify-center text-xs font-sans font-medium shrink-0"
                  style={{ background: 'rgba(168,104,68,0.2)', color: 'var(--copper)', border: '0.5px solid rgba(168,104,68,0.3)' }}
                >
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm text-pearl font-sans">{t.name}</div>
                  <div className="text-[0.65rem] text-dim">{t.title}</div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
