import { motion } from 'framer-motion'
import { fadeUp } from '../lib/animations'

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="relative pt-20 pb-10 overflow-hidden"
      style={{ borderTop: '0.5px solid rgba(11,26,46,0.08)' }}
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
            <a
              href="https://wa.me/18193422290"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-3 text-sm text-pearl/50 hover:text-pearl transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp — réponse en 2h
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
          style={{ borderTop: '0.5px solid rgba(11,26,46,0.06)' }}
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
