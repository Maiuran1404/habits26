'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, LogOut, Settings, Target, Sparkles, Lock, Unlock, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { HabitWithEntries, Quarter, getCurrentQuarter, Habit } from '@/types/database'
import HabitCard from './HabitCard'
import HabitModal from './HabitModal'
import QuarterSelector from './QuarterSelector'
import PartnerSection from './PartnerSection'
import ThemeToggle from './ThemeToggle'
import GoalsSection from './GoalsSection'

export default function HabitTracker() {
  const { user, profile, loading: authLoading, setShowAuthModal, signOut } = useAuth()
  const [habits, setHabits] = useState<HabitWithEntries[]>([])
  const [loading, setLoading] = useState(true)
  const [quarter, setQuarter] = useState<Quarter>(getCurrentQuarter())
  const [year, setYear] = useState(new Date().getFullYear())
  const [showHabitModal, setShowHabitModal] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Mantra state
  const [mantra, setMantra] = useState('')
  const [isMantraLocked, setIsMantraLocked] = useState(true)
  const [isEditingMantra, setIsEditingMantra] = useState(false)

  // Load mantra from localStorage on mount
  useEffect(() => {
    const savedMantra = localStorage.getItem('habit-mantra')
    const savedLocked = localStorage.getItem('habit-mantra-locked')
    if (savedMantra) setMantra(savedMantra)
    if (savedLocked !== null) setIsMantraLocked(savedLocked === 'true')
  }, [])

  // Save mantra to localStorage when it changes
  const handleMantraChange = (newMantra: string) => {
    setMantra(newMantra)
    localStorage.setItem('habit-mantra', newMantra)
  }

  const toggleMantraLock = () => {
    const newLocked = !isMantraLocked
    setIsMantraLocked(newLocked)
    localStorage.setItem('habit-mantra-locked', String(newLocked))
    if (newLocked) setIsEditingMantra(false)
  }

  const supabase = useMemo(() => createClient(), [])

  const userId = user?.id

  const fetchHabits = useCallback(async () => {
    if (!userId) {
      setHabits([])
      setLoading(false)
      return
    }

    setLoading(true)

    // Timeout safety net - don't hang forever (5 seconds)
    const timeout = setTimeout(() => {
      console.warn('Habits fetch timed out - check if database tables exist')
      setHabits([])
      setLoading(false)
    }, 5000)

    try {
      const { data, error } = await supabase
        .from('habits')
        .select('*, entries:habit_entries(*)')
        .eq('user_id', userId)
        .eq('archived', false)
        .order('created_at', { ascending: true })

      clearTimeout(timeout)

      if (error) {
        console.error('Error fetching habits:', error)
        setHabits([])
      } else if (data) {
        setHabits(data as HabitWithEntries[])
      } else {
        setHabits([])
      }
    } catch (err) {
      clearTimeout(timeout)
      console.error('Error fetching habits:', err)
      setHabits([])
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    fetchHabits()
  }, [fetchHabits])

  const handleDayClick = async (habitId: string, date: string) => {
    if (!user) return

    const habit = habits.find((h) => h.id === habitId)
    if (!habit) return

    const existingEntry = habit.entries.find((e) => e.date === date)

    // Optimistic update
    const updateEntries = (entries: typeof habit.entries) => {
      if (existingEntry) {
        if (existingEntry.status === 'done') {
          return entries.map((e) =>
            e.id === existingEntry.id ? { ...e, status: 'missed' as const } : e
          )
        } else {
          return entries.filter((e) => e.id !== existingEntry.id)
        }
      } else {
        return [
          ...entries,
          {
            id: `temp-${Date.now()}`,
            habit_id: habitId,
            date,
            status: 'done' as const,
            created_at: new Date().toISOString(),
          },
        ]
      }
    }

    setHabits((prev) =>
      prev.map((h) =>
        h.id === habitId ? { ...h, entries: updateEntries(h.entries) } : h
      )
    )

    // Server update
    let error = null
    if (existingEntry) {
      if (existingEntry.status === 'done') {
        const result = await supabase
          .from('habit_entries')
          .update({ status: 'missed' })
          .eq('id', existingEntry.id)
        error = result.error
      } else {
        const result = await supabase
          .from('habit_entries')
          .delete()
          .eq('id', existingEntry.id)
        error = result.error
      }
    } else {
      const result = await supabase.from('habit_entries').insert({
        habit_id: habitId,
        date,
        status: 'done',
      })
      error = result.error
    }

    // Revert on error
    if (error) {
      console.error('Error updating entry:', error)
      fetchHabits()
    }
  }

  const handleSaveHabit = async (habitData: {
    name: string
    description: string
    color: string
    target_per_week: number
  }) => {
    if (!user) throw new Error('You must be logged in')

    if (editingHabit) {
      // Optimistic update for editing
      setHabits((prev) =>
        prev.map((h) =>
          h.id === editingHabit.id
            ? { ...h, ...habitData }
            : h
        )
      )

      const { error } = await supabase
        .from('habits')
        .update(habitData)
        .eq('id', editingHabit.id)

      if (error) {
        fetchHabits() // Revert on error
        throw new Error(error.message)
      }
    } else {
      // Optimistic update for creating - add with temp ID
      const tempId = `temp-${Date.now()}`
      const newHabit: HabitWithEntries = {
        id: tempId,
        user_id: user.id,
        name: habitData.name,
        description: habitData.description,
        color: habitData.color,
        target_per_week: habitData.target_per_week,
        created_at: new Date().toISOString(),
        archived: false,
        entries: [],
      }
      setHabits((prev) => [...prev, newHabit])

      const { data, error } = await supabase.from('habits').insert({
        ...habitData,
        user_id: user.id,
      }).select().single()

      if (error) {
        fetchHabits() // Revert on error
        throw new Error(error.message)
      }

      // Replace temp habit with real one
      if (data) {
        setHabits((prev) =>
          prev.map((h) => (h.id === tempId ? { ...data, entries: [] } : h))
        )
      }
    }

    setEditingHabit(null)
  }

  const handleDeleteHabit = async (habitId: string) => {
    if (!confirm('Are you sure you want to delete this habit?')) return

    // Optimistic update
    const deletedHabit = habits.find((h) => h.id === habitId)
    setHabits((prev) => prev.filter((h) => h.id !== habitId))

    const { error } = await supabase.from('habits').delete().eq('id', habitId)

    if (error) {
      // Revert on error
      console.error('Error deleting habit:', error)
      if (deletedHabit) {
        setHabits((prev) => [...prev, deletedHabit])
      }
    }
  }

  const handleTodayClick = (habitId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    handleDayClick(habitId, today)
  }

  const handleEditHabit = (habit: HabitWithEntries) => {
    setEditingHabit(habit)
    setShowHabitModal(true)
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--background)]/80 backdrop-blur-lg border-b border-[var(--card-border)]">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center">
              <Target size={18} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">Habits</h1>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <button
                  onClick={() => {
                    setEditingHabit(null)
                    setShowHabitModal(true)
                  }}
                  className="flex items-center gap-1.5 bg-[var(--accent-600)] hover:bg-[var(--accent-500)] text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  Create
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-bg)] rounded-lg transition-colors"
                  >
                    <Settings size={18} />
                  </button>
                  {showSettings && (
                    <>
                      <div
                        className="fixed inset-0"
                        onClick={() => setShowSettings(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-xl overflow-hidden min-w-[180px] backdrop-blur">
                        <div className="px-4 py-3 border-b border-[var(--card-border)]">
                          <p className="text-sm font-medium text-[var(--foreground)]">
                            {profile?.display_name || user.email?.split('@')[0]}
                          </p>
                          <p className="text-xs text-[var(--muted-light)]">{user.email}</p>
                        </div>
                        <ThemeToggle />
                        <button
                          onClick={() => {
                            signOut()
                            setShowSettings(false)
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-bg)] transition-colors border-t border-[var(--card-border)]"
                        >
                          <LogOut size={16} />
                          Sign Out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="bg-[var(--accent-600)] hover:bg-[var(--accent-500)] text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Mantra Section */}
        {user && (
          <div className="mb-6">
            {isEditingMantra ? (
              <div className="relative">
                <textarea
                  value={mantra}
                  onChange={(e) => handleMantraChange(e.target.value)}
                  placeholder="Write your mantra..."
                  autoFocus
                  className="w-full bg-[var(--card-bg)] border border-[var(--accent-border)] rounded-xl p-4 text-center text-lg font-semibold text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] resize-none"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      setIsEditingMantra(false)
                    }
                    if (e.key === 'Escape') {
                      setIsEditingMantra(false)
                    }
                  }}
                  onBlur={() => setIsEditingMantra(false)}
                />
                <p className="text-xs text-[var(--muted-light)] text-center mt-1">
                  Press Enter to save, Escape to cancel
                </p>
              </div>
            ) : mantra ? (
              <div className="group relative bg-gradient-to-r from-[var(--accent-bg)] to-transparent border border-[var(--accent-border)] rounded-xl p-4">
                <p className="text-center text-lg font-bold text-[var(--foreground)] italic">
                  &ldquo;{mantra}&rdquo;
                </p>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isMantraLocked && (
                    <button
                      onClick={() => setIsEditingMantra(true)}
                      className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] rounded-lg transition-colors"
                      title="Edit mantra"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={toggleMantraLock}
                    className="p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] rounded-lg transition-colors"
                    title={isMantraLocked ? 'Unlock to edit' : 'Lock mantra'}
                  >
                    {isMantraLocked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsMantraLocked(false)
                  setIsEditingMantra(true)
                }}
                className="w-full border border-dashed border-[var(--card-border)] hover:border-[var(--accent-border)] rounded-xl p-4 text-[var(--muted)] hover:text-[var(--accent-text)] transition-colors"
              >
                + Add your mantra
              </button>
            )}
          </div>
        )}

        {/* Goals Section */}
        {user && <GoalsSection />}

        {/* User Profile Section */}
        {!authLoading && user && profile && (
          <div className="mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--accent-600)] to-[var(--accent-700)] flex items-center justify-center text-2xl text-white font-medium ring-2 ring-[var(--accent-500)]">
                {profile.display_name?.[0]?.toUpperCase() ||
                  profile.email[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--foreground)]">
                  {profile.display_name || profile.email.split('@')[0]}
                </h2>
                <p className="text-[var(--muted-light)] text-sm">
                  {habits.length} habit{habits.length !== 1 ? 's' : ''} this sprint
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quarter Selector */}
        <div className="flex justify-center mb-6">
          <QuarterSelector
            quarter={quarter}
            year={year}
            onChange={(q, y) => {
              setQuarter(q)
              setYear(y)
            }}
          />
        </div>

        {/* Habits List */}
        {authLoading ? (
          // Auth loading state - checking session
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[var(--card-bg)] rounded-xl p-5 animate-pulse border border-[var(--card-border)]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="h-5 w-32 bg-[var(--card-border)] rounded mb-2" />
                    <div className="h-3 w-48 bg-[var(--card-border)] rounded opacity-50" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="grid grid-cols-7 gap-1">
                    {[...Array(28)].map((_, j) => (
                      <div key={j} className="w-3 h-3 bg-[var(--card-border)] rounded-sm opacity-50" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !user ? (
          // Not logged in - Welcome state
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-[var(--accent-bg)] flex items-center justify-center border border-[var(--accent-border)]">
              <div className="grid grid-cols-4 gap-1">
                {[...Array(16)].map((_, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-sm transition-colors"
                    style={{
                      backgroundColor: [0, 5, 6, 9, 10, 15].includes(i) ? 'var(--accent-500)' : 'var(--card-border)',
                      opacity: [0, 5, 6, 9, 10, 15].includes(i) ? 1 : 0.3,
                    }}
                  />
                ))}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-[var(--foreground)] mb-3">
              Build Better Habits
            </h2>
            <p className="text-[var(--muted)] mb-8 max-w-md mx-auto leading-relaxed">
              Track your daily progress, set quarterly goals, and stay accountable with friends. Simple, visual, and effective.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="bg-[var(--accent-600)] hover:bg-[var(--accent-500)] text-white font-medium px-8 py-3 rounded-xl transition-all hover:scale-105 shadow-lg shadow-green-500/20"
            >
              Get Started Free
            </button>
            <p className="text-[var(--muted-light)] text-sm mt-4">
              No credit card required
            </p>
          </div>
        ) : loading ? (
          // Loading state
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[var(--card-bg)] rounded-xl p-5 animate-pulse border border-[var(--card-border)]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="h-5 w-32 bg-[var(--card-border)] rounded mb-2" />
                    <div className="h-3 w-48 bg-[var(--card-border)] rounded opacity-50" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="grid grid-cols-7 gap-1">
                    {[...Array(28)].map((_, j) => (
                      <div key={j} className="w-3 h-3 bg-[var(--card-border)] rounded-sm opacity-50" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : habits.length === 0 ? (
          // Empty state - No habits yet
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[var(--card-bg)] flex items-center justify-center border border-[var(--card-border)]">
              <Sparkles className="text-[var(--accent-500)]" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">
              Start Your Journey
            </h3>
            <p className="text-[var(--muted)] mb-6 max-w-sm mx-auto">
              Create your first habit and begin tracking your progress. Small steps lead to big changes.
            </p>
            <button
              onClick={() => {
                setEditingHabit(null)
                setShowHabitModal(true)
              }}
              className="inline-flex items-center gap-2 bg-[var(--accent-600)] hover:bg-[var(--accent-500)] text-white font-medium px-6 py-2.5 rounded-xl transition-all hover:scale-105"
            >
              <Plus size={18} />
              Create Your First Habit
            </button>

            {/* Suggested habits */}
            <div className="mt-10 pt-8 border-t border-[var(--card-border)]">
              <p className="text-[var(--muted-light)] text-sm mb-4">Popular habits to get started</p>
              <div className="flex flex-wrap justify-center gap-2">
                {['Morning Exercise', 'Read 30 mins', 'Meditate', 'Drink Water', 'No Social Media'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setEditingHabit(null)
                      setShowHabitModal(true)
                    }}
                    className="px-3 py-1.5 bg-[var(--card-bg)] hover:bg-[var(--accent-bg)] text-[var(--muted)] hover:text-[var(--foreground)] text-sm rounded-lg transition-colors border border-[var(--card-border)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Habits list
          <div className="space-y-4">
            {habits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                quarter={quarter}
                year={year}
                onDayClick={handleDayClick}
                onTodayClick={handleTodayClick}
                onEdit={handleEditHabit}
                onDelete={handleDeleteHabit}
              />
            ))}
          </div>
        )}

        {/* Partner Section */}
        {user && <PartnerSection quarter={quarter} year={year} />}
      </main>

      {/* Habit Modal */}
      <HabitModal
        isOpen={showHabitModal}
        onClose={() => {
          setShowHabitModal(false)
          setEditingHabit(null)
        }}
        onSave={handleSaveHabit}
        habit={editingHabit}
      />
    </div>
  )
}
