import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'

const links = [
  { label: 'Services',     href: '#services' },
  { label: 'Cas clients',  href: '#cases' },
  { label: 'Démo',         href: '#demo' },
  { label: 'Tarifs',       href: '#pricing' },
  { label: 'FAQ',          href: '#faq' },
]

export default function Navbar() {
  const [scrolled, setScrolled]   = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (!menuOpen) return
      if (!e.target.closest('nav')) setMenuOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menuOpen])

  return (
    <motion.nav
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'glass-card py-3'
          : 'bg-transparent py-5'
      }`}
      aria-label="Navigation principale"
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <a href="#" className="flex items-center gap-3 group" aria-label="Novalis IA — Accueil">
          <div className="w-8 h-8 relative">
            <div className="absolute inset-0 border border-copper opacity-60 rotate-45 group-hover:rotate-[90deg] transition-transform duration-500" />
            <div className="absolute inset-[5px] bg-copper opacity-80" />
          </div>
          <span className="font-display italic text-xl text-pearl tracking-wide">Novalis</span>
          <span
            className="text-[0.55rem] tracking-[0.25em] uppercase text-copper font-sans font-medium"
            style={{ marginTop: '2px' }}
          >
            IA
          </span>
        </a>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-8" role="list">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="text-[0.8rem] tracking-widest uppercase text-pearl/60 hover:text-pearl transition-colors duration-200 font-sans"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-4">
          <a href="#contact" className="btn-copper text-xs">
            Consultation gratuite
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-pearl/70 hover:text-pearl transition-colors"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden overflow-hidden glass-card border-t-0 border-x-0"
          >
            <ul className="flex flex-col px-6 py-6 gap-5" role="list">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="text-sm tracking-widest uppercase text-pearl/70 hover:text-pearl block transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="pt-2">
                <a
                  href="#contact"
                  onClick={() => setMenuOpen(false)}
                  className="btn-copper text-xs block text-center"
                >
                  Consultation gratuite
                </a>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  )
}
