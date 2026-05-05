import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { fadeUp, stagger, viewportOnce } from '../lib/animations'

const techs = [
  { name: 'Claude (Anthropic)', category: 'IA générative' },
  { name: 'GPT-4o', category: 'IA générative' },
  { name: 'Twilio', category: 'Téléphonie' },
  { name: 'WhatsApp Business', category: 'Messagerie' },
  { name: 'Salesforce', category: 'CRM' },
  { name: 'HubSpot', category: 'CRM' },
  { name: 'Microsoft 365', category: 'Productivité' },
  { name: 'Google Workspace', category: 'Productivité' },
  { name: 'SAP', category: 'ERP' },
  { name: 'Stripe', category: 'Paiements' },
  { name: 'REST / WebSockets', category: 'Intégration' },
  { name: 'FastAPI', category: 'Infrastructure' },
]

export default function TechStack() {
  const ref    = useRef(null)
  const inView = useInView(ref, viewportOnce)

  return (
    <section ref={ref} className="relative py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          className="mb-14 text-center"
          variants={fadeUp}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          <span className="label-caps">Technologies & intégrations</span>
          <h2
            className="display-heading mt-4"
            style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
          >
            Compatible avec votre
            <br />
            <em>écosystème existant</em>
          </h2>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3"
          variants={stagger}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
        >
          {techs.map((t) => (
            <motion.div
              key={t.name}
              variants={fadeUp}
              className="glass-card-subtle pearl-border px-4 py-5 text-center group hover:border-copper/30 transition-all duration-300"
            >
              <div className="text-[0.6rem] tracking-widest uppercase text-dim mb-2 group-hover:text-copper transition-colors">
                {t.category}
              </div>
              <div className="text-xs text-pearl/70 group-hover:text-pearl transition-colors font-sans leading-tight">
                {t.name}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
