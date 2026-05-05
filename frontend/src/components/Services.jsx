import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Phone, MessageSquare, BarChart2, FileText, Users, Zap } from 'lucide-react'
import { fadeUp, fadeLeft, fadeRight, stagger, viewportOnce } from '../lib/animations'

const services = [
  {
    icon: Phone,
    title: 'Assistant vocal IA',
    desc: "Votre téléphone répond 24/7, qualifie les appels, prend les rendez-vous et transfère selon les priorités — sans agent humain.",
    tag: 'Le plus populaire',
    highlight: true,
  },
  {
    icon: MessageSquare,
    title: 'Chatbot intelligent',
    desc: "Intégré à votre site ou WhatsApp, il répond instantanément, capture des leads et escalade vers votre équipe quand nécessaire.",
    tag: null,
    highlight: false,
  },
  {
    icon: BarChart2,
    title: 'Analyse prédictive',
    desc: "Transformez vos données en décisions. L'IA détecte les tendances, anticipe la demande et optimise vos opérations en continu.",
    tag: null,
    highlight: false,
  },
  {
    icon: FileText,
    title: 'Automatisation documentaire',
    desc: "Traitez automatiquement bons de commande, factures, contrats et formulaires — extraction, validation et routage intelligents.",
    tag: null,
    highlight: false,
  },
  {
    icon: Users,
    title: 'CRM augmenté',
    desc: "L'IA enrichit vos contacts, segmente votre base, rédige des suivis personnalisés et prédit quels prospects convertir en priorité.",
    tag: null,
    highlight: false,
  },
  {
    icon: Zap,
    title: 'Intégrations sur mesure',
    desc: "Chaque solution s'intègre à vos outils existants : Salesforce, HubSpot, Microsoft 365, SAP, systèmes propriétaires.",
    tag: null,
    highlight: false,
  },
]

export default function Services() {
  const ref = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section id="services" ref={ref} className="relative py-32 overflow-hidden">
      <span className="section-number top-0 left-[-1rem]" aria-hidden="true">02</span>

      <div className="max-w-7xl mx-auto px-6">

        {/* Header — asymmetric */}
        <div className="grid lg:grid-cols-12 gap-8 mb-20">
          <motion.div
            className="lg:col-span-5"
            variants={fadeLeft}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="copper-line w-10" />
              <span className="label-caps">Nos solutions</span>
            </div>
            <h2
              className="display-heading"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
            >
              L'IA qui s'adapte
              <br />
              <em>à votre réalité</em>
            </h2>
          </motion.div>

          <motion.div
            className="lg:col-span-5 lg:col-start-8 self-end"
            variants={fadeRight}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <p className="text-dim leading-relaxed">
              Chaque intégration est configurée selon vos processus, votre secteur et vos objectifs.
              Pas de solutions génériques — une IA qui comprend votre contexte dès le premier jour.
            </p>
          </motion.div>
        </div>

        {/* Cards grid */}
        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {services.map((svc) => {
            const Icon = svc.icon
            return (
              <motion.div
                key={svc.title}
                variants={fadeUp}
                className={`relative p-8 group transition-all duration-500 ${
                  svc.highlight
                    ? 'glass-card hover:shadow-copper-glow'
                    : 'glass-card-subtle pearl-border hover:border-copper/30'
                }`}
              >
                {svc.highlight && (
                  <div
                    className="absolute top-0 left-0 right-0 h-[0.5px]"
                    style={{ background: 'linear-gradient(90deg, var(--copper) 0%, transparent 100%)' }}
                  />
                )}

                {svc.tag && (
                  <div className="inline-block px-3 py-1 mb-4 text-[0.6rem] tracking-widest uppercase bg-copper/10 text-copper border border-copper/20">
                    {svc.tag}
                  </div>
                )}

                <div
                  className="w-10 h-10 flex items-center justify-center mb-5 transition-colors duration-300"
                  style={{ border: '0.5px solid rgba(168,104,68,0.3)', color: 'var(--copper)' }}
                >
                  <Icon size={18} />
                </div>

                <h3 className="font-display italic text-2xl text-pearl mb-3 leading-tight">
                  {svc.title}
                </h3>
                <p className="text-dim text-sm leading-relaxed">{svc.desc}</p>

                <div
                  className="mt-6 flex items-center gap-2 text-xs tracking-widest uppercase text-copper/60 group-hover:text-copper transition-colors duration-300"
                >
                  <span>En savoir plus</span>
                  <div className="w-4 h-[0.5px] bg-current transition-all duration-300 group-hover:w-8" />
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
