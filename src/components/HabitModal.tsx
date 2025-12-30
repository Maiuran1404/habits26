'use client'

import { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { Habit } from '@/types/database'

interface HabitModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (habit: { name: string; description: string; color: string; target_per_week: number }) => Promise<void>
  habit?: Habit | null
}

const colorOptions = [
  '#22c55e', // green
  '#16a34a', // dark green
  '#4ade80', // light green
  '#15803d', // forest green
  '#86efac', // mint
  '#14b8a6', // teal
  '#059669', // emerald
  '#34d399', // sea green
]

const getFrequencyLabel = (value: number): string => {
  if (value === 7) return 'Daily'
  if (value === 1) return '1x per week'
  return `${value}x per week`
}

export default function HabitModal({
  isOpen,
  onClose,
  onSave,
  habit,
}: HabitModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(colorOptions[0])
  const [targetPerWeek, setTargetPerWeek] = useState(7)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (habit) {
      setName(habit.name)
      setDescription(habit.description || '')
      setColor(habit.color)
      setTargetPerWeek(habit.target_per_week || 7)
    } else {
      setName('')
      setDescription('')
      setColor(colorOptions[0])
      setTargetPerWeek(7)
    }
    setError(null)
  }, [habit, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      await onSave({ name: name.trim(), description: description.trim(), color, target_per_week: targetPerWeek })
      onClose()
    } catch (err) {
      console.error('Failed to save habit:', err)
      setError(err instanceof Error ? err.message : 'Failed to save habit. Please make sure the database is set up.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[var(--card-bg)] rounded-2xl p-6 w-full max-w-md mx-4 border border-[var(--card-border)] shadow-2xl backdrop-blur">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-[var(--foreground)] mb-6">
          {habit ? 'Edit Habit' : 'Create New Habit'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={16} />
            <div>
              <p className="text-red-400 text-sm">{error}</p>
              <p className="text-red-400/60 text-xs mt-1">
                Have you run the SQL schema in Supabase?
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
              Habit Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning Exercise"
              required
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg py-2.5 px-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this habit involve?"
              rows={3}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg py-2.5 px-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-[var(--foreground)] scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted)] mb-2">
              Weekly Target
            </label>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-semibold text-[var(--foreground)]">
                  {getFrequencyLabel(targetPerWeek)}
                </span>
                <span className="text-sm text-[var(--muted)]">
                  {targetPerWeek}/7 days
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="7"
                value={targetPerWeek}
                onChange={(e) => setTargetPerWeek(parseInt(e.target.value))}
                className="w-full h-2 bg-[var(--card-border)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-500)]"
                style={{
                  background: `linear-gradient(to right, var(--accent-500) 0%, var(--accent-500) ${((targetPerWeek - 1) / 6) * 100}%, var(--card-border) ${((targetPerWeek - 1) / 6) * 100}%, var(--card-border) 100%)`
                }}
              />
              <div className="flex justify-between text-xs text-[var(--muted-light)]">
                <span>1x</span>
                <span>2x</span>
                <span>3x</span>
                <span>4x</span>
                <span>5x</span>
                <span>6x</span>
                <span>7x</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[var(--card-border)] hover:bg-[var(--card-hover-border)] text-[var(--foreground)] font-medium py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 bg-[var(--accent-600)] hover:bg-[var(--accent-500)] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : habit ? 'Save Changes' : 'Create Habit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
