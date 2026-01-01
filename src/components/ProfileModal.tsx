'use client'

import { useState, useMemo } from 'react'
import { X, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { profile, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() || null })
        .eq('id', profile?.id)

      if (updateError) throw updateError

      await refreshProfile()
      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="relative glass-card p-6 w-full max-w-sm animate-slideUp">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 pill-button p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="text-lg font-bold text-[var(--foreground)] mb-1">
          Edit Profile
        </h2>
        <p className="text-[var(--muted)] text-sm mb-5">
          Update your display name
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-xl text-[var(--accent-text)] text-sm">
            Profile updated successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wide">
              Display Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-light)]" size={16} />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl py-2.5 pl-10 pr-4 text-sm text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
            </div>
          </div>

          <div className="text-xs text-[var(--muted-light)]">
            Email: {profile?.email}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="pill-button w-full bg-[var(--accent-500)] hover:bg-[var(--accent-400)] disabled:opacity-50 text-white font-medium py-2.5 text-sm transition-colors"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
