'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Plus, X, Circle, CheckCircle2, ChevronLeft, ChevronRight, ChevronDown, Target } from 'lucide-react'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Goal, GoalType, Quarter, getQuarterDates } from '@/types/database'

interface GoalColumn {
  type: GoalType
  title: string
  subtitle: string
  weekStart?: string
}

interface GoalsSectionProps {
  quarter: Quarter
  year: number
}

export default function GoalsSection({ quarter, year }: GoalsSectionProps) {
  const { user } = useAuth()
  const userId = user?.id
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [addingTo, setAddingTo] = useState<GoalType | null>(null)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('goals-section-expanded')
      return saved !== null ? saved === 'true' : true
    }
    return true
  })

  // Save expanded state to localStorage
  useEffect(() => {
    localStorage.setItem('goals-section-expanded', String(isExpanded))
  }, [isExpanded])

  const supabase = useMemo(() => createClient(), [])

  // Get the quarter dates
  const quarterDates = useMemo(() => getQuarterDates(year, quarter), [year, quarter])

  // Calculate the current week within the selected quarter
  const currentWeek = useMemo(() => {
    const today = new Date()
    const quarterStart = quarterDates.start
    const quarterEnd = quarterDates.end

    // If we're in the selected quarter, use current week
    // Otherwise, use the first week of the quarter
    let baseDate: Date
    if (today >= quarterStart && today <= quarterEnd) {
      baseDate = today
    } else if (today < quarterStart) {
      baseDate = quarterStart
    } else {
      baseDate = quarterEnd
    }

    // Apply week offset
    const offsetDate = weekOffset === 0 ? baseDate : addWeeks(baseDate, weekOffset)

    // Clamp to quarter bounds
    const weekStart = startOfWeek(offsetDate, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(offsetDate, { weekStartsOn: 1 })

    return { weekStart, weekEnd }
  }, [quarterDates, weekOffset])

  // Reset week offset when quarter changes
  useEffect(() => {
    setWeekOffset(0)
  }, [quarter, year])

  const columns = useMemo<GoalColumn[]>(() => {
    return [
      {
        type: 'weekly' as GoalType,
        title: 'Week',
        subtitle: `${format(currentWeek.weekStart, 'MMM d')} - ${format(currentWeek.weekEnd, 'MMM d')}`,
        weekStart: format(currentWeek.weekStart, 'yyyy-MM-dd'),
      },
      {
        type: 'quarterly' as GoalType,
        title: 'Quarter',
        subtitle: `${quarter} ${year}`,
      },
      {
        type: 'yearly' as GoalType,
        title: 'Year',
        subtitle: year.toString(),
      },
    ]
  }, [quarter, year, currentWeek])

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

  const handleAddGoal = async (type: GoalType, weekStart?: string) => {
    if (!userId || !newGoalTitle.trim()) return

    const tempId = `temp-${Date.now()}`
    const newGoal: Goal = {
      id: tempId,
      user_id: userId,
      title: newGoalTitle.trim(),
      type,
      completed: false,
      created_at: new Date().toISOString(),
      quarter: type === 'quarterly' || type === 'weekly' ? quarter : null,
      year: year,
      week_start: type === 'weekly' ? weekStart : null,
    }

    setGoals((prev) => [...prev, newGoal])
    setNewGoalTitle('')
    setAddingTo(null)

    const insertData: any = {
      user_id: userId,
      title: newGoalTitle.trim(),
      type,
      completed: false,
      year: year,
    }

    // Add quarter for quarterly and weekly goals
    if (type === 'quarterly' || type === 'weekly') {
      insertData.quarter = quarter
    }

    // Add week_start for weekly goals
    if (type === 'weekly' && weekStart) {
      insertData.week_start = weekStart
    }

    const { data, error } = await supabase
      .from('goals')
      .insert(insertData)
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

  const getGoalsByType = (type: GoalType, weekStart?: string) => {
    return goals.filter((g) => {
      if (g.type !== type) return false

      // For yearly goals, match by year
      if (type === 'yearly') {
        // Include goals without year field (legacy) or matching year
        return !g.year || g.year === year
      }

      // For quarterly goals, match by quarter and year
      if (type === 'quarterly') {
        // Include goals without quarter/year (legacy) or matching
        if (!g.quarter && !g.year) return true
        return g.quarter === quarter && g.year === year
      }

      // For weekly goals, match by week_start
      if (type === 'weekly') {
        // Include goals without week_start (legacy) or matching
        if (!g.week_start) return true
        return g.week_start === weekStart
      }

      return true
    })
  }

  // Calculate total goals and completed count for summary
  const totalGoals = goals.length
  const completedGoals = goals.filter(g => g.completed).length

  if (!userId) return null

  return (
    <div className="glass-card overflow-hidden">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[var(--card-bg)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Target size={14} className="text-[var(--accent-500)]" />
          <span className="text-sm font-medium text-[var(--foreground)]">Goals</span>
          {totalGoals > 0 && (
            <span className="text-xs text-[var(--muted)] px-1.5 py-0.5 bg-[var(--card-bg)] rounded-full">
              {completedGoals}/{totalGoals}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`text-[var(--muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0">
          <div className="grid grid-cols-3 gap-3">
            {columns.map((column) => {
              const columnGoals = getGoalsByType(column.type, column.weekStart)
              return (
                <div
                  key={column.type}
                  className="flex flex-col"
                >
                  {/* Column Header */}
                  <div className="mb-2">
                    <h3 className="font-semibold text-[var(--foreground)] text-xs">
                      {column.title}
                    </h3>
                    {column.type === 'weekly' ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setWeekOffset(prev => prev - 1)}
                          className="p-0.5 hover:bg-[var(--card-bg)] rounded transition-colors"
                        >
                          <ChevronLeft size={12} className="text-[var(--muted)]" />
                        </button>
                        <p className="text-[10px] text-[var(--muted)] flex-1 text-center">{column.subtitle}</p>
                        <button
                          onClick={() => setWeekOffset(prev => prev + 1)}
                          className="p-0.5 hover:bg-[var(--card-bg)] rounded transition-colors"
                        >
                          <ChevronRight size={12} className="text-[var(--muted)]" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-[var(--muted)]">{column.subtitle}</p>
                    )}
                  </div>

                  {/* Goals List */}
                  <div className="space-y-1 min-h-[40px]">
                    {loading ? (
                      <div className="h-4 bg-[var(--card-border)] rounded-full animate-pulse" />
                    ) : (
                      <>
                        {columnGoals.map((goal) => (
                          <div
                            key={goal.id}
                            className="group flex items-start gap-1.5 p-1 rounded-lg hover:bg-[var(--card-bg)] transition-colors"
                          >
                            <button
                              onClick={() => handleToggleGoal(goal.id)}
                              className="flex-shrink-0 mt-0.5"
                            >
                              {goal.completed ? (
                                <CheckCircle2
                                  size={14}
                                  className="text-[var(--accent-500)]"
                                />
                              ) : (
                                <Circle
                                  size={14}
                                  className="text-[var(--muted-light)]"
                                />
                              )}
                            </button>
                            <span
                              className={`flex-1 text-xs leading-tight ${
                                goal.completed
                                  ? 'text-[var(--muted-light)] line-through'
                                  : 'text-[var(--foreground)]'
                              }`}
                            >
                              {goal.title}
                            </span>
                            <button
                              onClick={() => handleDeleteGoal(goal.id)}
                              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-500/20 rounded-full"
                            >
                              <X size={10} className="text-[var(--muted-light)] hover:text-red-400" />
                            </button>
                          </div>
                        ))}

                        {/* Add Goal Input or Button */}
                        {addingTo === column.type ? (
                          <div className="flex items-center gap-1 p-1">
                            <input
                              type="text"
                              value={newGoalTitle}
                              onChange={(e) => setNewGoalTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddGoal(column.type, column.weekStart)
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
                              className="flex-1 bg-transparent text-xs text-[var(--foreground)] placeholder-[var(--muted-light)] outline-none border-b border-[var(--accent-border)] py-0.5"
                            />
                            <button
                              onClick={() => handleAddGoal(column.type, column.weekStart)}
                              className="pill-button p-1 hover:bg-[var(--card-bg)]"
                            >
                              <Plus size={12} className="text-[var(--accent-500)]" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingTo(column.type)}
                            className="flex items-center gap-0.5 text-[10px] text-[var(--muted-light)] hover:text-[var(--accent-text)] p-1 rounded-lg transition-colors"
                          >
                            <Plus size={10} />
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
      )}
    </div>
  )
}
