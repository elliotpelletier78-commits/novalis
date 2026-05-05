import Grain from './components/Grain'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Stats from './components/Stats'
import Services from './components/Services'
import Process from './components/Process'
import Cases from './components/Cases'
import Demo from './components/Demo'
import AICapabilities from './components/AICapabilities'
import Testimonials from './components/Testimonials'
import Subsidies from './components/Subsidies'
import Pricing from './components/Pricing'
import TechStack from './components/TechStack'
import FAQ from './components/FAQ'
import RoiCalc from './components/RoiCalc'
import Contact from './components/Contact'
import Footer from './components/Footer'

export default function App() {
  return (
    <>
      <Grain />
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Services />
        <Process />
        <Cases />
        <Demo />
        <AICapabilities />
        <Testimonials />
        <RoiCalc />
        <Subsidies />
        <Pricing />
        <TechStack />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
