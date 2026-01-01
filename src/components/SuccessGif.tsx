'use client'

import { useEffect, useState } from 'react'

// Collection of celebration/success GIFs
const SUCCESS_GIFS = [
  'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif', // Success kid
  'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif', // Confetti celebration
  'https://media.giphy.com/media/3oz8xRF0v9WMAUVLNK/giphy.gif', // Thumbs up
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif', // Dancing celebration
  'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif', // Seal of approval
  'https://media.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif', // Excited
  'https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif', // High five
  'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif', // Celebration dance
  'https://media.giphy.com/media/3oEjI5VtIhHvK37WYo/giphy.gif', // Fireworks
  'https://media.giphy.com/media/l3V0wkQ2KKcAeW8Cs/giphy.gif', // Party
]

interface SuccessGifProps {
  show: boolean
  onComplete: () => void
  duration?: number
}

export default function SuccessGif({ show, onComplete, duration = 2500 }: SuccessGifProps) {
  const [gifUrl, setGifUrl] = useState('')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (show) {
      // Pick a random GIF
      const randomGif = SUCCESS_GIFS[Math.floor(Math.random() * SUCCESS_GIFS.length)]
      setGifUrl(randomGif)
      setIsVisible(true)

      // Hide after duration
      const timer = setTimeout(() => {
        setIsVisible(false)
        setTimeout(onComplete, 300) // Wait for fade out animation
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [show, duration, onComplete])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(onComplete, 300)
  }

  if (!show && !isVisible) return null

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop with slight blur - clickable to dismiss */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm cursor-pointer"
        onClick={handleDismiss}
      />

      {/* GIF container */}
      <div
        className={`relative transform transition-all duration-300 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-90 translate-y-4'
        }`}
      >
        <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gifUrl}
            alt="Success!"
            className="w-64 h-64 object-cover"
          />

          {/* Gradient overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
            <p className="text-white text-center font-bold text-lg drop-shadow-lg">
              Nice work! 🎉
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
