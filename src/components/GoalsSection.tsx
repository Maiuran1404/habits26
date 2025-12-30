'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Plus, X, Circle, CheckCircle2 } from 'lucide-react'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Goal, GoalType } from '@/types/database'

interface GoalColumn {
  type: GoalType
  title: string
  subtitle: string
}

export default function GoalsSection() {
  const { user } = useAuth()
  const userId = user?.id
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [addingTo, setAddingTo] = useState<GoalType | null>(null)
  const [newGoalTitle, setNewGoalTitle] = useState('')

  const supabase = useMemo(() => createClient(), [])

  const columns = useMemo<GoalColumn[]>(() => {
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

    const getQuarterLabel = () => {
      const month = today.getMonth()
      const q = Math.floor(month / 3) + 1
      return `Q${q} ${today.getFullYear()}`
    }

    return [
      {
        type: 'weekly' as GoalType,
        title: 'Week',
        subtitle: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`,
      },
      {
        type: 'quarterly' as GoalType,
        title: 'Quarter',
        subtitle: getQuarterLabel(),
      },
      {
        type: 'yearly' as GoalType,
        title: 'Year',
        subtitle: today.getFullYear().toString(),
      },
    ]
  }, [])

  const fetchGoals = useCallback(async () => {
    if (!userId) {
      setGoals([])
      setLoading(false)
      return
    }

    setLoading(true)

    // Timeout safety net - don't hang forever (3 seconds for goals)
    const timeout = setTimeout(() => {
      console.warn('Goals fetch timed out')
      setGoals([])
      setLoading(false)
    }, 3000)

    try {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      clearTimeout(timeout)

      if (error) {
        console.error('Error fetching goals:', error)
        setGoals([])
      } else {
        setGoals(data || [])
      }
    } catch (err) {
      clearTimeout(timeout)
      console.error('Error fetching goals:', err)
      setGoals([])
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  const handleAddGoal = async (type: GoalType) => {
    if (!userId || !newGoalTitle.trim()) return

    const tempId = `temp-${Date.now()}`
    const newGoal: Goal = {
      id: tempId,
      user_id: userId,
      title: newGoalTitle.trim(),
      type,
      completed: false,
      created_at: new Date().toISOString(),
    }

    setGoals((prev) => [...prev, newGoal])
    setNewGoalTitle('')
    setAddingTo(null)

    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: userId,
        title: newGoalTitle.trim(),
        type,
        completed: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding goal:', error)
      setGoals((prev) => prev.filter((g) => g.id !== tempId))
    } else if (data) {
      setGoals((prev) => prev.map((g) => (g.id === tempId ? data : g)))
    }
  }

  const handleToggleGoal = async (goalId: string) => {
    const goal = goals.find((g) => g.id === goalId)
    if (!goal) return

    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, completed: !g.completed } : g))
    )

    const { error } = await supabase
      .from('goals')
      .update({ completed: !goal.completed })
      .eq('id', goalId)

    if (error) {
      console.error('Error toggling goal:', error)
      setGoals((prev) =>
        prev.map((g) => (g.id === goalId ? { ...g, completed: goal.completed } : g))
      )
    }
  }

  const handleDeleteGoal = async (goalId: string) => {
    const deletedGoal = goals.find((g) => g.id === goalId)
    setGoals((prev) => prev.filter((g) => g.id !== goalId))

    const { error } = await supabase.from('goals').delete().eq('id', goalId)

    if (error) {
      console.error('Error deleting goal:', error)
      if (deletedGoal) {
        setGoals((prev) => [...prev, deletedGoal])
      }
    }
  }

  const getGoalsByType = (type: GoalType) => {
    return goals.filter((g) => g.type === type)
  }

  if (!userId) return null

  return (
    <div className="mb-6">
      <div className="grid grid-cols-3 gap-3">
        {columns.map((column) => {
          const columnGoals = getGoalsByType(column.type)
          return (
            <div
              key={column.type}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden"
            >
              {/* Column Header */}
              <div className="px-3 py-2 border-b border-[var(--card-border)]">
                <h3 className="font-semibold text-[var(--foreground)] text-sm">
                  {column.title}
                </h3>
                <p className="text-xs text-[var(--muted-light)]">{column.subtitle}</p>
              </div>

              {/* Goals List */}
              <div className="p-2 space-y-1.5 min-h-[80px]">
                {loading ? (
                  <div className="h-6 bg-[var(--card-border)] rounded animate-pulse" />
                ) : (
                  <>
                    {columnGoals.map((goal) => (
                      <div
                        key={goal.id}
                        className="group flex items-start gap-2 p-1.5 rounded-lg hover:bg-[var(--accent-bg)] transition-colors"
                      >
                        <button
                          onClick={() => handleToggleGoal(goal.id)}
                          className="flex-shrink-0 mt-0.5"
                        >
                          {goal.completed ? (
                            <CheckCircle2
                              size={16}
                              className="text-[var(--accent-500)]"
                            />
                          ) : (
                            <Circle
                              size={16}
                              className="text-[var(--muted-light)]"
                            />
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm leading-tight ${
                            goal.completed
                              ? 'text-[var(--muted-light)] line-through'
                              : 'text-[var(--foreground)]'
                          }`}
                        >
                          {goal.title}
                        </span>
                        <button
                          onClick={() => handleDeleteGoal(goal.id)}
                          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-500/20 rounded"
                        >
                          <X size={12} className="text-[var(--muted-light)] hover:text-red-400" />
                        </button>
                      </div>
                    ))}

                    {/* Add Goal Input or Button */}
                    {addingTo === column.type ? (
                      <div className="flex items-center gap-1.5 p-1">
                        <input
                          type="text"
                          value={newGoalTitle}
                          onChange={(e) => setNewGoalTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddGoal(column.type)
                            if (e.key === 'Escape') {
                              setAddingTo(null)
                              setNewGoalTitle('')
                            }
                          }}
                          onBlur={() => {
                            if (!newGoalTitle.trim()) {
                              setAddingTo(null)
                              setNewGoalTitle('')
                            }
                          }}
                          placeholder="Goal..."
                          autoFocus
                          className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder-[var(--muted-light)] outline-none border-b border-[var(--accent-border)] py-0.5"
                        />
                        <button
                          onClick={() => handleAddGoal(column.type)}
                          className="p-1 hover:bg-[var(--accent-bg)] rounded"
                        >
                          <Plus size={14} className="text-[var(--accent-500)]" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingTo(column.type)}
                        className="flex items-center gap-1 text-xs text-[var(--muted-light)] hover:text-[var(--accent-text)] p-1 rounded transition-colors"
                      >
                        <Plus size={12} />
                        Add
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
