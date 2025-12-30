'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, LogOut, Settings } from 'lucide-react'
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

    if (!error && data) {
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
      // Cycle through states: done -> missed -> none
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
      // Create new entry as done
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
    if (!user) return

    if (editingHabit) {
      await supabase
        .from('habits')
        .update(habitData)
        .eq('id', editingHabit.id)
    } else {
      await supabase.from('habits').insert({
        ...habitData,
        user_id: user.id,
      })
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
          <h1 className="text-xl font-bold text-white">Habits</h1>

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
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-2xl text-white font-medium">
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
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-zinc-900 flex items-center justify-center">
              <div className="grid grid-cols-3 gap-1">
                {[...Array(9)].map((_, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-sm"
                    style={{
                      backgroundColor: i % 2 === 0 ? '#22c55e' : '#27272a',
                    }}
                  />
                ))}
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Track Your Habits
            </h2>
            <p className="text-zinc-500 mb-6 max-w-sm mx-auto">
              Sign in to start tracking your daily habits and see your progress over quarterly sprints
            </p>
            <button
              onClick={() => setShowAuthModal(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
            >
              Get Started
            </button>
          </div>
        ) : loading ? (
          <div className="text-center py-16 text-zinc-500">Loading habits...</div>
        ) : habits.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl">
            <Plus className="mx-auto text-zinc-600 mb-2" size={32} />
            <p className="text-zinc-500 text-sm">No habits yet</p>
            <p className="text-zinc-600 text-xs mt-1 mb-4">
              Create your first habit to start tracking
            </p>
            <button
              onClick={() => {
                setEditingHabit(null)
                setShowHabitModal(true)
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Create Habit
            </button>
          </div>
        ) : (
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
