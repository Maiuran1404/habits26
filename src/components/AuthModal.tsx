'use client'

import { useState, useMemo } from 'react'
import { X, Mail, Lock, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

export default function AuthModal() {
  const { showAuthModal, setShowAuthModal } = useAuth()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])

  if (!showAuthModal) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    // Timeout wrapper to prevent infinite loading
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please try again.')), 10000)
    )

    try {
      if (isSignUp) {
        const result = await Promise.race([
          supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                display_name: displayName || email.split('@')[0],
              },
            },
          }),
          timeoutPromise,
        ]) as { data: { session: unknown } | null; error: Error | null }

        if (result.error) throw result.error
        // Auto-login: if session exists, user is logged in immediately
        if (result.data?.session) {
          setShowAuthModal(false)
        }
      } else {
        const result = await Promise.race([
          supabase.auth.signInWithPassword({
            email,
            password,
          }),
          timeoutPromise,
        ]) as { error: Error | null }

        if (result.error) throw result.error
        setShowAuthModal(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setShowAuthModal(false)}
      />
      <div className="relative bg-[var(--card-bg)] rounded-2xl p-8 w-full max-w-md mx-4 border border-[var(--card-border)] shadow-2xl backdrop-blur">
        <button
          onClick={() => setShowAuthModal(false)}
          className="absolute top-4 right-4 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h2>
        <p className="text-[var(--muted)] mb-6">
          {isSignUp
            ? 'Start tracking your habits with friends'
            : 'Sign in to continue your progress'}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-lg text-[var(--accent-text)] text-sm">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
                Display Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-light)]" size={18} />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg py-2.5 pl-10 pr-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-light)]" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg py-2.5 pl-10 pr-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-light)]" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg py-2.5 pl-10 pr-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--accent-600)] hover:bg-[var(--accent-500)] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError(null)
              setMessage(null)
            }}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors text-sm"
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  )
}
