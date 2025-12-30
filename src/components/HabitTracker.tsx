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

    // Timeout safety net - don't hang forever (3 seconds)
    const timeout = setTimeout(() => {
      console.warn('Habits fetch timed out - check if database tables exist')
      setHabits([])
      setLoading(false)
    }, 3000)

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

    // Revert on error - check if error has actual content (empty object {} is truthy but not a real error)
    if (error && Object.keys(error).length > 0) {
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
    <div className="min-h-[100dvh] bg-[var(--background)] flex flex-col items-center justify-start py-8 px-4">
      {/* Main Container - Centered Glass Card */}
      <div className="w-full max-w-[28rem]">
        {/* Header */}
        <div className="glass-card p-5 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center shadow-lg shadow-green-500/20">
                <Target size={20} className="text-white" />
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
                    className="pill-button flex items-center gap-1.5 bg-[var(--accent-500)] hover:bg-[var(--accent-400)] text-white text-sm font-medium px-4 py-2"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className="pill-button p-2.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
                    >
                      <Settings size={18} />
                    </button>
                    {showSettings && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowSettings(false)}
                        />
                        <div className="absolute right-0 top-full mt-2 z-50 glass-card overflow-hidden min-w-[200px]">
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
                  className="pill-button bg-[var(--accent-500)] hover:bg-[var(--accent-400)] text-white text-sm font-medium px-5 py-2"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <main className="space-y-4">
        {/* Mantra Section */}
        {user && mantra && (
          <div className="glass-card p-4 group relative">
            {isEditingMantra ? (
              <div className="relative">
                <textarea
                  value={mantra}
                  onChange={(e) => handleMantraChange(e.target.value)}
                  placeholder="Write your mantra..."
                  autoFocus
                  className="w-full bg-transparent text-center text-base font-medium text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none resize-none"
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
              </div>
            ) : (
              <>
                <p className="text-center text-base font-medium text-[var(--foreground)] italic">
                  &ldquo;{mantra}&rdquo;
                </p>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isMantraLocked && (
                    <button
                      onClick={() => setIsEditingMantra(true)}
                      className="pill-button p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]"
                      title="Edit mantra"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={toggleMantraLock}
                    className="pill-button p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)]"
                    title={isMantraLocked ? 'Unlock to edit' : 'Lock mantra'}
                  >
                    {isMantraLocked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Add mantra button when no mantra exists */}
        {user && !mantra && (
          <button
            onClick={() => {
              setIsMantraLocked(false)
              setIsEditingMantra(true)
              setMantra('')
            }}
            className="glass-card w-full p-4 text-center text-[var(--muted)] hover:text-[var(--accent-text)] transition-colors"
          >
            + Add your mantra
          </button>
        )}

        {/* Goals Section */}
        {user && <GoalsSection />}

        {/* User Profile Section */}
        {!authLoading && user && profile && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center text-xl text-white font-semibold shadow-lg shadow-green-500/20">
                {profile.display_name?.[0]?.toUpperCase() ||
                  profile.email[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-[var(--foreground)]">
                  {profile.display_name || profile.email.split('@')[0]}
                </h2>
                <p className="text-[var(--muted)] text-sm">
                  {habits.length} habit{habits.length !== 1 ? 's' : ''} this quarter
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quarter Selector */}
        <div className="flex justify-center">
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
          // Auth loading state
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="glass-card p-5 animate-pulse">
                <div className="h-5 w-28 bg-[var(--card-border)] rounded-full mb-3" />
                <div className="grid grid-cols-7 gap-1">
                  {[...Array(21)].map((_, j) => (
                    <div key={j} className="w-3 h-3 bg-[var(--card-border)] rounded-sm opacity-50" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !user ? (
          // Not logged in - Welcome state
          <div className="glass-card p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center shadow-lg shadow-green-500/20">
              <div className="grid grid-cols-3 gap-0.5">
                {[...Array(9)].map((_, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-sm"
                    style={{
                      backgroundColor: [0, 4, 6, 8].includes(i) ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                    }}
                  />
                ))}
              </div>
            </div>
            <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">
              Build Better Habits
            </h2>
            <p className="text-[var(--muted)] mb-6 text-sm leading-relaxed">
              Track your daily progress with a simple, visual habit tracker.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="pill-button bg-[var(--accent-500)] hover:bg-[var(--accent-400)] text-white font-medium px-6 py-2.5 shadow-lg shadow-green-500/20"
            >
              Get Started
            </button>
          </div>
        ) : loading ? (
          // Loading state
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="glass-card p-5 animate-pulse">
                <div className="h-5 w-28 bg-[var(--card-border)] rounded-full mb-3" />
                <div className="grid grid-cols-7 gap-1">
                  {[...Array(21)].map((_, j) => (
                    <div key={j} className="w-3 h-3 bg-[var(--card-border)] rounded-sm opacity-50" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : habits.length === 0 ? (
          // Empty state - No habits yet
          <div className="glass-card p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[var(--accent-bg)] flex items-center justify-center">
              <Sparkles className="text-[var(--accent-500)]" size={24} />
            </div>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
              Start Your Journey
            </h3>
            <p className="text-[var(--muted)] mb-5 text-sm">
              Create your first habit to begin tracking.
            </p>
            <button
              onClick={() => {
                setEditingHabit(null)
                setShowHabitModal(true)
              }}
              className="pill-button inline-flex items-center gap-2 bg-[var(--accent-500)] hover:bg-[var(--accent-400)] text-white font-medium px-5 py-2"
            >
              <Plus size={16} />
              Create Habit
            </button>

            {/* Suggested habits */}
            <div className="mt-6 pt-5 border-t border-[var(--card-border)]">
              <p className="text-[var(--muted-light)] text-xs mb-3">Popular habits</p>
              <div className="flex flex-wrap justify-center gap-2">
                {['Exercise', 'Read', 'Meditate', 'Journal'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setEditingHabit(null)
                      setShowHabitModal(true)
                    }}
                    className="pill-button px-3 py-1 bg-[var(--card-bg)] hover:bg-[var(--accent-bg)] text-[var(--muted)] hover:text-[var(--foreground)] text-xs transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Habits list
          <div className="space-y-3">
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
      </div>

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
