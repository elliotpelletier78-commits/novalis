import { useEffect, useRef } from 'react'

export default function Cursor() {
  const dotRef  = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    const dot  = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    let mouseX = -100, mouseY = -100
    let ringX  = -100, ringY  = -100
    let raf

    const onMove = (e) => {
      mouseX = e.clientX
      mouseY = e.clientY
    }

    const onEnter = () => {
      ring.style.transform = `translate(-50%,-50%) scale(2.2)`
      ring.style.opacity   = '0.4'
      dot.style.opacity    = '0'
    }
    const onLeave = () => {
      ring.style.transform = `translate(-50%,-50%) scale(1)`
      ring.style.opacity   = '1'
      dot.style.opacity    = '1'
    }

    const loop = () => {
      ringX += (mouseX - ringX) * 0.12
      ringY += (mouseY - ringY) * 0.12

      dot.style.left  = mouseX + 'px'
      dot.style.top   = mouseY + 'px'
      ring.style.left = ringX + 'px'
      ring.style.top  = ringY + 'px'

      raf = requestAnimationFrame(loop)
    }

    const interactives = document.querySelectorAll('a, button, input, textarea, select, [role="button"]')
    interactives.forEach(el => {
      el.addEventListener('mouseenter', onEnter)
      el.addEventListener('mouseleave', onLeave)
    })

    window.addEventListener('mousemove', onMove)
    raf = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
      interactives.forEach(el => {
        el.removeEventListener('mouseenter', onEnter)
        el.removeEventListener('mouseleave', onLeave)
      })
    }
  }, [])

  return (
    <>
      {/* Dot */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          background: 'var(--copper)',
          pointerEvents: 'none',
          zIndex: 99999,
          transform: 'translate(-50%,-50%)',
          transition: 'opacity 0.2s',
        }}
      />
      {/* Ring */}
      <div
        ref={ringRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          border: '0.5px solid rgba(168,104,68,0.6)',
          pointerEvents: 'none',
          zIndex: 99998,
          transform: 'translate(-50%,-50%) scale(1)',
          transition: 'transform 0.3s ease, opacity 0.3s ease',
        }}
      />
    </>
  )
}
