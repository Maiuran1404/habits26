'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Plus, LogOut, Settings, Target, Sparkles, Lock, Unlock, Pencil, Flame, Calendar } from 'lucide-react'
import { format, getDayOfYear, startOfQuarter, differenceInDays, parseISO, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { HabitWithEntries, Quarter, getCurrentQuarter, Habit } from '@/types/database'
import HabitCard from './HabitCard'
import QuarterSelector from './QuarterSelector'
import ThemeToggle from './ThemeToggle'
import GoalsSection from './GoalsSection'

// Lazy load components that aren't immediately visible
const HabitModal = dynamic(() => import('./HabitModal'), { ssr: false })
const PartnerSection = dynamic(() => import('./PartnerSection'), { ssr: false })

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

  const handleDayClick = useCallback(async (habitId: string, date: string) => {
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
    if (existingEntry && !existingEntry.id.startsWith('temp-')) {
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
    } else if (!existingEntry) {
      const result = await supabase.from('habit_entries').insert({
        habit_id: habitId,
        date,
        status: 'done',
      }).select().single()
      error = result.error

      // Update local state with real ID from database
      if (result.data) {
        setHabits((prev) =>
          prev.map((h) =>
            h.id === habitId
              ? {
                  ...h,
                  entries: h.entries.map((e) =>
                    e.date === date && e.id.startsWith('temp-') ? result.data : e
                  ),
                }
              : h
          )
        )
      }
    } else {
      // Entry has temp ID - refetch to sync with server
      fetchHabits()
      return
    }

    // Revert on error - check for actual error message
    if (error?.message) {
      console.error('Error updating entry:', error)
      fetchHabits()
    }
  }, [user, habits, supabase, fetchHabits])

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

  // Memoize today's date string to avoid recalculating on each render
  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])

  // Calculate day of year and day of quarter
  const dayProgress = useMemo(() => {
    const today = new Date()
    const dayOfYear = getDayOfYear(today)
    const quarterStart = startOfQuarter(today)
    const dayOfQuarter = differenceInDays(today, quarterStart) + 1
    const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    const daysInYear = isLeapYear(today.getFullYear()) ? 366 : 365
    // Quarters have ~90 days (Q1: 90/91, Q2: 91, Q3: 92, Q4: 92)
    const currentQuarter = Math.floor(today.getMonth() / 3) + 1
    const daysInQuarter = currentQuarter === 1 ? (isLeapYear(today.getFullYear()) ? 91 : 90)
                        : currentQuarter === 2 ? 91
                        : 92
    return { dayOfYear, dayOfQuarter, daysInYear, daysInQuarter }
  }, [])

  // Calculate tracking streak (consecutive days with at least one habit marked done)
  const trackingStreak = useMemo(() => {
    if (habits.length === 0) return 0

    // Get all unique dates with at least one "done" entry
    const allDoneDates = new Set<string>()
    habits.forEach(habit => {
      habit.entries.forEach(entry => {
        if (entry.status === 'done') {
          allDoneDates.add(entry.date)
        }
      })
    })

    if (allDoneDates.size === 0) return 0

    // Sort dates descending
    const sortedDates = Array.from(allDoneDates).sort((a, b) => b.localeCompare(a))

    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const yesterdayStr = format(subDays(today, 1), 'yyyy-MM-dd')

    // Streak only counts if most recent is today or yesterday
    const mostRecent = sortedDates[0]
    if (mostRecent !== todayStr && mostRecent !== yesterdayStr) return 0

    // Count consecutive days
    let streak = 1
    let currentDate = parseISO(mostRecent)

    for (let i = 1; i < sortedDates.length; i++) {
      const expectedPrev = format(subDays(currentDate, 1), 'yyyy-MM-dd')
      if (sortedDates[i] === expectedPrev) {
        streak++
        currentDate = parseISO(sortedDates[i])
      } else {
        break
      }
    }

    return streak
  }, [habits])

  const handleTodayClick = useCallback((habitId: string) => {
    handleDayClick(habitId, todayStr)
  }, [handleDayClick, todayStr])

  const handleEditHabit = useCallback((habit: HabitWithEntries) => {
    setEditingHabit(habit)
    setShowHabitModal(true)
  }, [])

  // Memoize quarter change handler
  const handleQuarterChange = useCallback((q: Quarter, y: number) => {
    setQuarter(q)
    setYear(y)
  }, [])

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] flex flex-col items-center justify-start py-4 lg:py-6 px-4">
      {/* Main Container */}
      <div className="w-full max-w-[28rem] lg:max-w-5xl">
        {/* Header - Clean & Compact */}
        <div className="glass-card p-4 mb-4">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Logo + Title + Quarter */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center flex-shrink-0">
                <Target size={18} className="text-white" />
              </div>
              <div className="hidden lg:block">
                <QuarterSelector
                  quarter={quarter}
                  year={year}
                  onChange={handleQuarterChange}
                  compact
                />
              </div>
            </div>

            {/* Center: Mantra (desktop only) */}
            {user && mantra && (
              <div className="hidden lg:flex flex-1 justify-center min-w-0 group">
                {isEditingMantra ? (
                  <input
                    type="text"
                    value={mantra}
                    onChange={(e) => handleMantraChange(e.target.value)}
                    placeholder="Your mantra..."
                    autoFocus
                    className="w-full max-w-md bg-transparent text-center text-sm text-[var(--muted)] placeholder-[var(--muted-light)] focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsEditingMantra(false)
                      if (e.key === 'Escape') setIsEditingMantra(false)
                    }}
                    onBlur={() => setIsEditingMantra(false)}
                  />
                ) : (
                  <div className="flex items-center gap-2 max-w-md">
                    <p className="text-sm text-[var(--muted)] italic truncate">
                      &ldquo;{mantra}&rdquo;
                    </p>
                    {!isMantraLocked && (
                      <button
                        onClick={() => setIsEditingMantra(true)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-[var(--card-bg)] rounded-full flex-shrink-0"
                      >
                        <Pencil size={12} className="text-[var(--muted-light)]" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Right: Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {user ? (
                <>
                  {/* Username display */}
                  <span className="hidden sm:block text-sm text-[var(--muted)] font-medium">
                    {profile?.display_name || user.email?.split('@')[0]}
                  </span>
                  <button
                    onClick={() => {
                      setEditingHabit(null)
                      setShowHabitModal(true)
                    }}
                    className="pill-button flex items-center gap-1.5 bg-[var(--accent-500)] hover:bg-[var(--accent-400)] text-white text-sm font-medium px-3 py-2"
                  >
                    <Plus size={16} />
                    <span className="hidden sm:inline">Add</span>
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className="pill-button p-2 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
                    >
                      <Settings size={18} />
                    </button>
                    {showSettings && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setShowSettings(false)}
                        />
                        <div className="absolute right-0 top-full mt-2 z-50 overflow-hidden min-w-[200px] rounded-2xl border border-[var(--glass-border)] shadow-lg" style={{ background: 'var(--background)' }}>
                          <div className="px-4 py-3 border-b border-[var(--card-border)]">
                            <p className="text-sm font-medium text-[var(--foreground)]">
                              {profile?.display_name || user.email?.split('@')[0]}
                            </p>
                            <p className="text-xs text-[var(--muted-light)]">{user.email}</p>
                          </div>
                          {/* Mantra lock toggle in settings */}
                          {mantra && (
                            <button
                              onClick={toggleMantraLock}
                              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-bg)] transition-colors"
                            >
                              {isMantraLocked ? <Lock size={16} /> : <Unlock size={16} />}
                              {isMantraLocked ? 'Unlock Mantra' : 'Lock Mantra'}
                            </button>
                          )}
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
                  className="pill-button bg-[var(--accent-500)] hover:bg-[var(--accent-400)] text-white text-sm font-medium px-4 py-2"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Progress Stats Bar - Day counters and streak (only for logged in users) */}
        {user && (
          <div className="glass-card p-3 mb-4">
            <div className="flex items-center justify-between gap-4">
              {/* Year Progress */}
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-[var(--accent-500)]" />
                <div className="text-sm">
                  <span className="font-semibold text-[var(--foreground)]">Day {dayProgress.dayOfYear}</span>
                  <span className="text-[var(--muted)]">/{dayProgress.daysInYear}</span>
                </div>
              </div>

              {/* Quarter Progress */}
              <div className="flex items-center gap-2">
                <div className="text-sm">
                  <span className="font-semibold text-[var(--foreground)]">Q{Math.floor(new Date().getMonth() / 3) + 1} Day {dayProgress.dayOfQuarter}</span>
                  <span className="text-[var(--muted)]">/{dayProgress.daysInQuarter}</span>
                </div>
              </div>

              {/* Tracking Streak */}
              <div className="flex items-center gap-2">
                <Flame size={16} className={trackingStreak > 0 ? "text-orange-500" : "text-[var(--muted-light)]"} />
                <div className="text-sm">
                  <span className={`font-semibold ${trackingStreak > 0 ? "text-orange-500" : "text-[var(--muted)]"}`}>
                    {trackingStreak}
                  </span>
                  <span className="text-[var(--muted)]"> day streak</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile: Quarter Selector */}
        <div className="flex justify-center mb-4 lg:hidden">
          <QuarterSelector
            quarter={quarter}
            year={year}
            onChange={handleQuarterChange}
          />
        </div>

        {/* Mobile: Mantra */}
        {user && mantra && (
          <div className="lg:hidden glass-card p-3 mb-4 group relative">
            {isEditingMantra ? (
              <input
                type="text"
                value={mantra}
                onChange={(e) => handleMantraChange(e.target.value)}
                placeholder="Your mantra..."
                autoFocus
                className="w-full bg-transparent text-center text-sm text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingMantra(false)
                  if (e.key === 'Escape') setIsEditingMantra(false)
                }}
                onBlur={() => setIsEditingMantra(false)}
              />
            ) : (
              <p
                onClick={() => !isMantraLocked && setIsEditingMantra(true)}
                className={`text-center text-sm text-[var(--muted)] italic ${!isMantraLocked ? 'cursor-pointer' : ''}`}
              >
                &ldquo;{mantra}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Add mantra button when no mantra exists */}
        {user && !mantra && (
          <button
            onClick={() => {
              setIsMantraLocked(false)
              setIsEditingMantra(true)
              setMantra(' ')
            }}
            className="w-full text-center text-xs text-[var(--muted-light)] hover:text-[var(--accent-text)] transition-colors mb-4 py-2"
          >
            + Add mantra
          </button>
        )}

        {/* Content Area */}
        <main className="space-y-4">
        {/* Goals Section - Collapsible on desktop */}
        {user && <GoalsSection quarter={quarter} year={year} />}

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
          // Habits list - responsive grid
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
