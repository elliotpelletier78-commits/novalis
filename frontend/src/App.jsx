import Grain from './components/Grain'
import Cursor from './components/Cursor'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Stats from './components/Stats'
import Services from './components/Services'
import Process from './components/Process'
import Cases from './components/Cases'
import Demo from './components/Demo'
import VoiceDemo from './components/VoiceDemo'
import AICapabilities from './components/AICapabilities'
import Testimonials from './components/Testimonials'
import RoiCalc from './components/RoiCalc'
import Subsidies from './components/Subsidies'
import Pricing from './components/Pricing'
import WhyNovalis from './components/WhyNovalis'
import TechStack from './components/TechStack'
import FAQ from './components/FAQ'
import Contact from './components/Contact'
import Footer from './components/Footer'
import WhatsAppButton from './components/WhatsAppButton'
import ExitIntent from './components/ExitIntent'

export default function App() {
  return (
    <>
      <Grain />
      <Cursor />
      <Navbar />
      <WhatsAppButton />
      <ExitIntent />
      <main>
        <Hero />
        <Stats />
        <Services />
        <Process />
        <Cases />
        <Demo />
        <VoiceDemo />
        <AICapabilities />
        <Testimonials />
        <RoiCalc />
        <Subsidies />
        <Pricing />
        <WhyNovalis />
        <TechStack />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
