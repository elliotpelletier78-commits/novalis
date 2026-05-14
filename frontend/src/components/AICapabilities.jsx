import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Brain, Shield, Globe, TrendingUp, Zap, BookOpen, AlertTriangle, Mic } from 'lucide-react'
import { fadeUp, fadeLeft, stagger, viewportOnce } from '../lib/animations'

const capabilities = [
  {
    icon: BookOpen,
    title: 'RAG — IA entraînée sur vos données',
    desc: 'Uploadez vos documents, FAQ, catalogue, politiques. L\'IA répond avec VOS informations exactes, pas des généralités. Recherche sémantique FTS5 sur chaque message.',
    tag: 'Nouveau',
    highlight: true,
  },
  {
    icon: Brain,
    title: 'Analyse de sentiment en temps réel',
    desc: 'Chaque message entrant est scoré de −1 (furieux) à +1 (enthousiaste). Les clients insatisfaits sont automatiquement détectés avant que ça dégénère.',
    tag: null,
    highlight: false,
  },
  {
    icon: AlertTriangle,
    title: 'Escalade automatique intelligente',
    desc: 'Règles configurables : si sentiment < −0.6, si un mot-clé critique apparaît, si la conversation dépasse N messages — transfert automatique vers votre équipe avec résumé IA.',
    tag: null,
    highlight: false,
  },
  {
    icon: Globe,
    title: 'Bilingue FR/EN automatique',
    desc: 'L\'IA détecte la langue du client et répond dans la même langue — français québécois ou anglais canadien — sans configuration manuelle.',
    tag: null,
    highlight: false,
  },
  {
    icon: Mic,
    title: 'Voix naturelle ElevenLabs',
    desc: 'Synthèse vocale de qualité humaine via ElevenLabs Multilingual v2. Fini la voix robotique — vos clients entendent une vraie voix chaleureuse.',
    tag: null,
    highlight: false,
  },
  {
    icon: TrendingUp,
    title: 'Analytics sentiment & résolution',
    desc: 'Dashboard complet : taux d\'escalade, taux de résolution, sentiment moyen par canal, distribution des intentions, alertes sur messages négatifs.',
    tag: null,
    highlight: false,
  },
  {
    icon: Zap,
    title: 'Résumés automatiques pour handoff',
    desc: 'Quand l\'IA transfère à un humain, elle génère un résumé : problème, ton du client, action requise. Votre agent reprend la conversation en 5 secondes.',
    tag: null,
    highlight: false,
  },
  {
    icon: Shield,
    title: 'Conformité Loi 25 & RGPD',
    desc: 'Toutes les données hébergées au Canada. Chiffrement AES-256. Accord de traitement des données signé avec chaque client. Zéro revente de données.',
    tag: null,
    highlight: false,
  },
]

export default function AICapabilities() {
  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section ref={ref} className="relative py-32 overflow-hidden">
      <span className="section-number top-0 right-[-1rem]" aria-hidden="true">06</span>

      <div className="max-w-7xl mx-auto px-6">

        {/* Header */}
        <div className="grid lg:grid-cols-12 gap-8 mb-20">
          <motion.div
            className="lg:col-span-5"
            variants={fadeLeft}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="copper-line w-10" />
              <span className="label-caps">Technologie IA de pointe</span>
            </div>
            <h2
              className="display-heading"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
            >
              Pas un chatbot.
              <br />
              <em>Une intelligence</em>
              <br />
              qui comprend.
            </h2>
          </motion.div>

          <motion.div
            className="lg:col-span-5 lg:col-start-8 self-end"
            variants={fadeUp}
            initial="hidden"
            animate={inView ? 'visible' : 'hidden'}
          >
            <p className="text-dim leading-relaxed text-sm">
              Chaque fonctionnalité est construite pour un objectif précis : que votre IA sache
              <em className="text-pearl/80"> exactement</em> ce que vos clients veulent, détecte
              les problèmes avant qu'ils s'aggravent, et remonte les bonnes informations
              au bon moment.
            </p>

            {/* Live indicator */}
            <div
              className="mt-6 inline-flex items-center gap-3 px-4 py-3 glass-card-subtle copper-border"
            >
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-pearl/70 font-sans">
                Modèle actif : Claude Sonnet 4.6 + Haiku 4.5 · Prompt caching activé
              </span>
            </div>
          </motion.div>
        </div>

        {/* Grid capabilities */}
        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-4"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {capabilities.map((cap) => {
            const Icon = cap.icon
            return (
              <motion.div
                key={cap.title}
                variants={fadeUp}
                className={`glass-card p-7 group transition-all duration-500 flex flex-col ${
                  cap.highlight ? 'hover:shadow-copper-glow' : ''
                }`}
              >
                {cap.highlight && (
                  <div
                    className="absolute top-0 left-0 right-0 h-[0.5px]"
                    style={{ background: 'linear-gradient(90deg, var(--copper) 0%, transparent 100%)' }}
                  />
                )}

                {cap.tag && (
                  <span
                    className="inline-block px-2 py-0.5 text-[0.55rem] tracking-widest uppercase mb-4 self-start"
                    style={{ background: 'rgba(40,96,232,0.15)', color: 'var(--copper)', border: '0.5px solid rgba(40,96,232,0.3)' }}
                  >
                    {cap.tag}
                  </span>
                )}

                <div
                  className="w-8 h-8 flex items-center justify-center mb-5 group-hover:bg-copper/10 transition-colors duration-300"
                  style={{ border: '0.5px solid rgba(40,96,232,0.3)', color: 'var(--copper)' }}
                >
                  <Icon size={14} />
                </div>

                <h3 className="font-sans font-medium text-sm text-pearl mb-3 leading-snug">
                  {cap.title}
                </h3>
                <p className="text-dim text-xs leading-relaxed flex-1">{cap.desc}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
