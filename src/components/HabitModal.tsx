'use client'

import { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { Habit } from '@/types/database'

interface HabitModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (habit: { name: string; description: string; color: string; target_per_week: number; goal_metric: string | null }) => Promise<void>
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
  const [goalMetric, setGoalMetric] = useState('')
  const [color, setColor] = useState(colorOptions[0])
  const [targetPerWeek, setTargetPerWeek] = useState(7)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (habit) {
      setName(habit.name)
      setDescription(habit.description || '')
      setGoalMetric(habit.goal_metric || '')
      setColor(habit.color)
      setTargetPerWeek(habit.target_per_week || 7)
    } else {
      setName('')
      setDescription('')
      setGoalMetric('')
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
      await onSave({ name: name.trim(), description: description.trim(), color, target_per_week: targetPerWeek, goal_metric: goalMetric.trim() || null })
      onClose()
    } catch (err) {
      console.error('Failed to save habit:', err)
      setError(err instanceof Error ? err.message : 'Failed to save habit. Please make sure the database is set up.')
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

        <h2 className="text-lg font-bold text-[var(--foreground)] mb-5">
          {habit ? 'Edit Habit' : 'New Habit'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2">
            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={16} />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wide">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning Exercise"
              required
              className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl py-2.5 px-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wide">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this habit involve?"
              rows={2}
              className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl py-2.5 px-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors resize-none text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-1.5 uppercase tracking-wide">
              Goal Metric <span className="text-[var(--muted-light)] normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={goalMetric}
              onChange={(e) => setGoalMetric(e.target.value)}
              placeholder="e.g., 10k steps, 7hrs sleep, 2hr work"
              className="w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl py-2.5 px-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-xl transition-all ${
                    color === c ? 'ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--glass-bg)] scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--muted)] mb-2 uppercase tracking-wide">
              Frequency
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {getFrequencyLabel(targetPerWeek)}
                </span>
                <span className="pill-button px-2 py-0.5 text-[10px] font-medium bg-[var(--accent-bg)] text-[var(--accent-text)]">
                  {targetPerWeek}/7
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="7"
                value={targetPerWeek}
                onChange={(e) => setTargetPerWeek(parseInt(e.target.value))}
                className="w-full h-2 bg-[var(--card-border)] rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, var(--accent-500) 0%, var(--accent-500) ${((targetPerWeek - 1) / 6) * 100}%, var(--card-border) ${((targetPerWeek - 1) / 6) * 100}%, var(--card-border) 100%)`
                }}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="pill-button flex-1 bg-[var(--card-bg)] hover:bg-[var(--card-border)] text-[var(--foreground)] font-medium py-2.5 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="pill-button flex-1 bg-[var(--accent-500)] hover:bg-[var(--accent-400)] disabled:opacity-50 text-white font-medium py-2.5 transition-colors text-sm"
            >
              {loading ? 'Saving...' : habit ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
