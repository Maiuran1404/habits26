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
  '#f97316', // orange
  '#3b82f6', // blue
  '#a855f7', // purple
  '#ec4899', // pink
  '#eab308', // yellow
  '#14b8a6', // teal
  '#f43f5e', // rose
]

const frequencyPresets = [
  { value: 7, label: 'Daily' },
  { value: 5, label: '5x/week' },
  { value: 3, label: '3x/week' },
  { value: 2, label: '2x/week' },
  { value: 1, label: '1x/week' },
]

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
      <div className="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-md mx-4 border border-zinc-800 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-white mb-6">
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
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Habit Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning Exercise"
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2.5 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this habit involve?"
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2.5 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Color
            </label>
            <div className="flex gap-2 flex-wrap">
              {colorOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Weekly Target
            </label>
            <div className="flex gap-2 flex-wrap">
              {frequencyPresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setTargetPerWeek(preset.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    targetPerWeek === preset.value
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Saving...' : habit ? 'Save Changes' : 'Create Habit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
