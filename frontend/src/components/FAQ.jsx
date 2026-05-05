import { useState, useRef } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { Plus, Minus } from 'lucide-react'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

const faqs = [
  {
    q: 'Faut-il des connaissances techniques pour utiliser vos solutions ?',
    a: "Non. Nos solutions sont clés en main. Vous interagissez avec un tableau de bord simple, et notre équipe s'occupe de toute la configuration technique, de l'intégration et de la maintenance.",
  },
  {
    q: 'En combien de temps verrons-nous des résultats concrets ?',
    a: "La plupart de nos clients mesurent un premier ROI entre 22 et 30 jours après la mise en production. Certains cas simples (assistant vocal, chatbot FAQ) montrent des gains dès la première semaine.",
  },
  {
    q: "L'IA peut-elle s'intégrer à nos outils existants ?",
    a: "Oui. Nous nous connectons à Salesforce, HubSpot, Microsoft 365, Google Workspace, SAP, Zoho, et à la plupart des systèmes via API. Si vous utilisez un logiciel propriétaire, nous évaluons l'intégration lors de l'audit gratuit.",
  },
  {
    q: "Vos solutions respectent-elles la Loi 25 et le RGPD ?",
    a: "Absolument. Toutes nos solutions sont conçues pour être conformes à la Loi 25 (Québec) et au RGPD. Les données de vos clients restent au Canada, avec chiffrement AES-256 au repos et en transit. Nous signons un accord de traitement des données avec chaque client.",
  },
  {
    q: "Que se passe-t-il si l'IA ne sait pas répondre ?",
    a: "L'IA détecte ses limites et transfère automatiquement à votre équipe avec le contexte complet de la conversation. Aucune demande n'est perdue. Le taux de transfert diminue à mesure que l'IA apprend.",
  },
  {
    q: 'Puis-je annuler à tout moment ?',
    a: "Oui. Nos abonnements sont mensuels, sans engagement annuel. Vous pouvez annuler à tout moment avec un préavis de 30 jours. Nous offrons également une garantie satisfait ou remboursé de 30 jours sur la première période.",
  },
  {
    q: "Comment l'IA apprend-elle notre secteur ?",
    a: "Lors de la configuration, nous alimentons l'IA avec vos documents (FAQ, politiques, catalogue, procédures) et vos historiques de conversations. Elle s'améliore ensuite en continu grâce aux interactions réelles, supervisées par notre équipe.",
  },
]

function FAQItem({ faq, index }) {
  const [open, setOpen] = useState(false)

  return (
    <motion.div variants={fadeUp} className="pearl-border border-b last:border-b-0">
      <button
        className="w-full flex items-center justify-between gap-4 py-6 text-left group"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm text-pearl/80 group-hover:text-pearl transition-colors font-sans leading-relaxed">
          {faq.q}
        </span>
        <div
          className="shrink-0 w-7 h-7 flex items-center justify-center transition-colors duration-200"
          style={{
            border: '0.5px solid rgba(168,104,68,0.3)',
            color: open ? 'var(--copper)' : 'var(--dim)',
          }}
        >
          {open ? <Minus size={12} /> : <Plus size={12} />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="text-dim text-sm leading-relaxed pb-6 pr-12">{faq.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function FAQ() {
  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section id="faq" ref={ref} className="relative py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-12 gap-16">

          {/* Left header */}
          <motion.div
            className="lg:col-span-4"
            variants={fadeUp}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="copper-line w-10" />
              <span className="label-caps">Questions fréquentes</span>
            </div>
            <h2
              className="display-heading"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)' }}
            >
              Tout ce que
              <br />
              vous voulez
              <br />
              <em>savoir</em>
            </h2>
            <p className="text-dim text-sm mt-6 leading-relaxed">
              Une question non listée ? Notre équipe répond en moins de 2 heures.
            </p>
            <a href="#contact" className="btn-ghost inline-flex mt-6 text-xs">
              Nous écrire
            </a>
          </motion.div>

          {/* Right — accordion */}
          <motion.div
            className="lg:col-span-7 lg:col-start-6"
            variants={stagger}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <div
              style={{ borderTop: '0.5px solid rgba(237,232,223,0.1)' }}
            >
              {faqs.map((faq, i) => (
                <FAQItem key={faq.q} faq={faq} index={i} />
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
