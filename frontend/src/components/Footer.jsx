import { motion } from 'framer-motion'
import { fadeUp } from '../lib/animations'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="relative pt-20 pb-10 overflow-hidden"
      style={{ borderTop: '0.5px solid rgba(237,232,223,0.08)' }}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-12 gap-12 mb-16">

          {/* Brand */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 relative">
                <div className="absolute inset-0 border border-copper opacity-60 rotate-45" />
                <div className="absolute inset-[5px] bg-copper opacity-80" />
              </div>
              <span className="font-display italic text-xl text-pearl">Novalis</span>
              <span className="text-[0.55rem] tracking-[0.25em] uppercase text-copper font-sans">IA</span>
            </div>
            <p className="text-dim text-sm leading-relaxed max-w-xs">
              Intelligence artificielle pratique pour les entreprises québécoises ambitieuses.
              Résultats mesurables. Équipe locale.
            </p>
            <a
              href="mailto:novalisproia@gmail.com"
              className="inline-block mt-5 text-sm text-copper hover:text-copper-light transition-colors"
            >
              novalisproia@gmail.com
            </a>
          </div>

          {/* Links */}
          <div className="lg:col-span-2 lg:col-start-7">
            <p className="label-caps mb-5">Navigation</p>
            <ul className="space-y-3">
              {[
                ['Services', '#services'],
                ['Cas clients', '#cases'],
                ['Démo', '#demo'],
                ['Tarifs', '#pricing'],
                ['FAQ', '#faq'],
              ].map(([label, href]) => (
                <li key={href}>
                  <a
                    href={href}
                    className="text-sm text-dim hover:text-pearl transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2">
            <p className="label-caps mb-5">Solutions</p>
            <ul className="space-y-3">
              {[
                'Assistant vocal IA',
                'Chatbot intelligent',
                'Analyse prédictive',
                'Automatisation docs',
                'CRM augmenté',
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#services"
                    className="text-sm text-dim hover:text-pearl transition-colors"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA block */}
          <div className="lg:col-span-3 lg:col-start-10">
            <div className="glass-card p-6">
              <div
                className="absolute top-0 left-0 right-0 h-[0.5px]"
                style={{ background: 'linear-gradient(90deg, var(--copper), transparent)' }}
              />
              <p className="font-display italic text-lg text-pearl mb-3">Prêt à commencer ?</p>
              <p className="text-dim text-xs mb-5 leading-relaxed">
                Consultation gratuite de 30 minutes avec notre équipe technique.
              </p>
              <a href="#contact" className="btn-copper text-xs block text-center">
                Réserver un appel
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8"
          style={{ borderTop: '0.5px solid rgba(237,232,223,0.06)' }}
        >
          <p className="text-[0.65rem] text-dim tracking-wide">
            © {year} Novalis IA inc. · Tous droits réservés · Québec, Canada
          </p>
          <div className="flex gap-6">
            <a
              href="mailto:novalisproia@gmail.com?subject=Politique%20de%20confidentialit%C3%A9"
              className="text-[0.65rem] text-dim hover:text-pearl transition-colors"
            >
              Politique de confidentialité
            </a>
            <a
              href="mailto:novalisproia@gmail.com?subject=Conditions%20d%27utilisation"
              className="text-[0.65rem] text-dim hover:text-pearl transition-colors"
            >
              Conditions d&apos;utilisation
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
