'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, LogOut, Settings, Target, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { HabitWithEntries, Quarter, getCurrentQuarter, Habit } from '@/types/database'
import HabitCard from './HabitCard'
import HabitModal from './HabitModal'
import QuarterSelector from './QuarterSelector'
import PartnerSection from './PartnerSection'

export default function HabitTracker() {
  const { user, profile, setShowAuthModal, signOut } = useAuth()
  const [habits, setHabits] = useState<HabitWithEntries[]>([])
  const [loading, setLoading] = useState(true)
  const [quarter, setQuarter] = useState<Quarter>(getCurrentQuarter())
  const [year, setYear] = useState(new Date().getFullYear())
  const [showHabitModal, setShowHabitModal] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const supabase = createClient()

  const fetchHabits = useCallback(async () => {
    if (!user) {
      setHabits([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('habits')
      .select('*, entries:habit_entries(*)')
      .eq('user_id', user.id)
      .eq('archived', false)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching habits:', error)
    }

    if (data) {
      setHabits(data as HabitWithEntries[])
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchHabits()
  }, [fetchHabits])

  const handleDayClick = async (habitId: string, date: string) => {
    if (!user) return

    const habit = habits.find((h) => h.id === habitId)
    if (!habit) return

    const existingEntry = habit.entries.find((e) => e.date === date)

    if (existingEntry) {
      if (existingEntry.status === 'done') {
        await supabase
          .from('habit_entries')
          .update({ status: 'missed' })
          .eq('id', existingEntry.id)
      } else {
        await supabase
          .from('habit_entries')
          .delete()
          .eq('id', existingEntry.id)
      }
    } else {
      await supabase.from('habit_entries').insert({
        habit_id: habitId,
        date,
        status: 'done',
      })
    }

    fetchHabits()
  }

  const handleSaveHabit = async (habitData: {
    name: string
    description: string
    color: string
  }) => {
    if (!user) throw new Error('You must be logged in')

    if (editingHabit) {
      const { error } = await supabase
        .from('habits')
        .update(habitData)
        .eq('id', editingHabit.id)

      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('habits').insert({
        ...habitData,
        user_id: user.id,
      })

      if (error) throw new Error(error.message)
    }

    setEditingHabit(null)
    fetchHabits()
  }

  const handleDeleteHabit = async (habitId: string) => {
    if (!confirm('Are you sure you want to delete this habit?')) return

    await supabase.from('habits').delete().eq('id', habitId)
    fetchHabits()
  }

  const handleEditHabit = (habit: HabitWithEntries) => {
    setEditingHabit(habit)
    setShowHabitModal(true)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-lg border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <Target size={18} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">Habits</h1>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <button
                  onClick={() => {
                    setEditingHabit(null)
                    setShowHabitModal(true)
                  }}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={16} />
                  Create
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                    <Settings size={18} />
                  </button>
                  {showSettings && (
                    <>
                      <div
                        className="fixed inset-0"
                        onClick={() => setShowSettings(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden min-w-[180px]">
                        <div className="px-4 py-3 border-b border-zinc-800">
                          <p className="text-sm font-medium text-white">
                            {profile?.display_name || user.email?.split('@')[0]}
                          </p>
                          <p className="text-xs text-zinc-500">{user.email}</p>
                        </div>
                        <button
                          onClick={() => {
                            signOut()
                            setShowSettings(false)
                          }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
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
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* User Profile Section */}
        {user && profile && (
          <div className="mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-2xl text-white font-medium ring-2 ring-zinc-700">
                {profile.display_name?.[0]?.toUpperCase() ||
                  profile.email[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {profile.display_name || profile.email.split('@')[0]}
                </h2>
                <p className="text-zinc-500 text-sm">
                  {habits.length} habit{habits.length !== 1 ? 's' : ''} this quarter
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
        {!user ? (
          // Not logged in - Welcome state
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center border border-emerald-500/20">
              <div className="grid grid-cols-4 gap-1">
                {[...Array(16)].map((_, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-sm transition-colors"
                    style={{
                      backgroundColor: [0, 5, 6, 9, 10, 15].includes(i) ? '#22c55e' : '#27272a',
                      opacity: [0, 5, 6, 9, 10, 15].includes(i) ? 1 : 0.3,
                    }}
                  />
                ))}
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">
              Build Better Habits
            </h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto leading-relaxed">
              Track your daily progress, set quarterly goals, and stay accountable with friends. Simple, visual, and effective.
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-8 py-3 rounded-xl transition-all hover:scale-105 shadow-lg shadow-emerald-500/20"
            >
              Get Started Free
            </button>
            <p className="text-zinc-600 text-sm mt-4">
              No credit card required
            </p>
          </div>
        ) : loading ? (
          // Loading state
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-zinc-900/50 rounded-xl p-5 animate-pulse">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="h-5 w-32 bg-zinc-800 rounded mb-2" />
                    <div className="h-3 w-48 bg-zinc-800/50 rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="grid grid-cols-7 gap-1">
                    {[...Array(28)].map((_, j) => (
                      <div key={j} className="w-3 h-3 bg-zinc-800/50 rounded-sm" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : habits.length === 0 ? (
          // Empty state - No habits yet
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center border border-zinc-700/50">
              <Sparkles className="text-emerald-500" size={32} />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              Start Your Journey
            </h3>
            <p className="text-zinc-400 mb-6 max-w-sm mx-auto">
              Create your first habit and begin tracking your progress. Small steps lead to big changes.
            </p>
            <button
              onClick={() => {
                setEditingHabit(null)
                setShowHabitModal(true)
              }}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-2.5 rounded-xl transition-all hover:scale-105"
            >
              <Plus size={18} />
              Create Your First Habit
            </button>

            {/* Suggested habits */}
            <div className="mt-10 pt-8 border-t border-zinc-800/50">
              <p className="text-zinc-500 text-sm mb-4">Popular habits to get started</p>
              <div className="flex flex-wrap justify-center gap-2">
                {['Morning Exercise', 'Read 30 mins', 'Meditate', 'Drink Water', 'No Social Media'].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setEditingHabit(null)
                      setShowHabitModal(true)
                    }}
                    className="px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm rounded-lg transition-colors border border-zinc-700/50"
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
