'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Calendar, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Profile, HabitWithEntries, Partnership } from '@/types/database'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  isSameMonth,
  getWeek
} from 'date-fns'

interface MonthlyComparisonProps {
  quarter: string
  year: number
}

interface PartnerData {
  partnership: Partnership
  profile: Profile
  habits: HabitWithEntries[]
}

interface WeekData {
  weekNum: number
  label: string
  percentage: number
  doneCount: number
  totalPossible: number
}

interface HabitMonthlyData {
  habitId: string
  habitName: string
  habitColor: string
  doneCount: number
  totalDays: number
  percentage: number
}

interface UserMonthlyData {
  userId: string
  displayName: string
  overallPercentage: number
  weeklyTrend: WeekData[]
  habitData: HabitMonthlyData[]
  totalDone: number
  totalPossible: number
}

function calculateMonthlyData(
  userId: string,
  displayName: string,
  habits: HabitWithEntries[],
  monthStart: Date
): UserMonthlyData {
  const monthEnd = endOfMonth(monthStart)
  const today = new Date()
  const effectiveEnd = monthEnd > today ? today : monthEnd

  // Only count days up to today if we're in the current month
  const daysInMonth = eachDayOfInterval({
    start: monthStart,
    end: effectiveEnd
  })

  const pastDays = daysInMonth.filter(d => d <= today)

  // Calculate weekly breakdown
  const weeklyTrend: WeekData[] = []
  const weeksInMonth = new Map<number, { days: Date[], doneCount: number }>()

  pastDays.forEach(day => {
    const weekNum = getWeek(day, { weekStartsOn: 1 })
    if (!weeksInMonth.has(weekNum)) {
      weeksInMonth.set(weekNum, { days: [], doneCount: 0 })
    }
    weeksInMonth.get(weekNum)!.days.push(day)
  })

  // Calculate done count per week
  habits.forEach(habit => {
    habit.entries.forEach(entry => {
      if (entry.status === 'done') {
        const entryDate = new Date(entry.date)
        if (entryDate >= monthStart && entryDate <= effectiveEnd) {
          const weekNum = getWeek(entryDate, { weekStartsOn: 1 })
          const weekData = weeksInMonth.get(weekNum)
          if (weekData) {
            weekData.doneCount++
          }
        }
      }
    })
  })

  // Convert to array and calculate percentages
  let weekIndex = 1
  Array.from(weeksInMonth.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([weekNum, data]) => {
      const totalPossible = data.days.length * habits.length
      const percentage = totalPossible > 0 ? Math.round((data.doneCount / totalPossible) * 100) : 0
      weeklyTrend.push({
        weekNum,
        label: `W${weekIndex}`,
        percentage,
        doneCount: data.doneCount,
        totalPossible
      })
      weekIndex++
    })

  // Calculate per-habit monthly data
  const habitData: HabitMonthlyData[] = habits.map(habit => {
    const doneCount = habit.entries.filter(entry => {
      if (entry.status !== 'done') return false
      const entryDate = new Date(entry.date)
      return entryDate >= monthStart && entryDate <= effectiveEnd
    }).length

    const totalDays = pastDays.length
    const percentage = totalDays > 0 ? Math.round((doneCount / totalDays) * 100) : 0

    return {
      habitId: habit.id,
      habitName: habit.name,
      habitColor: habit.color,
      doneCount,
      totalDays,
      percentage
    }
  })

  // Calculate overall
  const totalDone = habitData.reduce((sum, h) => sum + h.doneCount, 0)
  const totalPossible = pastDays.length * habits.length
  const overallPercentage = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0

  return {
    userId,
    displayName,
    overallPercentage,
    weeklyTrend,
    habitData,
    totalDone,
    totalPossible
  }
}

export default function MonthlyComparison({ quarter, year }: MonthlyComparisonProps) {
  const { user, profile: userProfile } = useAuth()
  const [partners, setPartners] = useState<PartnerData[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()))

  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id

  const [myHabits, setMyHabits] = useState<HabitWithEntries[]>([])

  const fetchMyHabits = useCallback(async () => {
    if (!userId) {
      setMyHabits([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('habits')
        .select('*, entries:habit_entries(*)')
        .eq('user_id', userId)
        .eq('archived', false)
        .order('created_at', { ascending: true })

      if (error) {
        setMyHabits([])
      } else {
        setMyHabits(data as HabitWithEntries[] || [])
      }
    } catch {
      setMyHabits([])
    }
  }, [userId, supabase])

  const fetchPartners = useCallback(async () => {
    if (!userId) {
      setPartners([])
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const { data: partnerships, error: partnershipError } = await supabase
        .from('partnerships')
        .select('*')
        .or(`user_id.eq.${userId},partner_id.eq.${userId}`)
        .eq('status', 'accepted')

      if (partnershipError || !partnerships || partnerships.length === 0) {
        setPartners([])
        setLoading(false)
        return
      }

      const partnerIds = partnerships.map((p: Partnership) =>
        p.user_id === userId ? p.partner_id : p.user_id
      )

      const [profilesResult, habitsResult] = await Promise.all([
        supabase.from('profiles').select('*').in('id', partnerIds),
        supabase.from('habits').select('*, entries:habit_entries(*)').in('user_id', partnerIds).eq('archived', false)
      ])

      const profiles = profilesResult.data
      const habits = habitsResult.data

      const partnerData: PartnerData[] = partnerships.map((partnership: Partnership) => {
        const partnerId = partnership.user_id === userId
          ? partnership.partner_id
          : partnership.user_id
        const profile = profiles?.find((p: Profile) => p.id === partnerId)
        const partnerHabits = (habits?.filter((h: HabitWithEntries) => h.user_id === partnerId) || []) as HabitWithEntries[]

        return {
          partnership,
          profile: profile as Profile,
          habits: partnerHabits,
        }
      }).filter((p: PartnerData) => p.profile)

      setPartners(partnerData)
    } catch {
      setPartners([])
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    if (userId) {
      fetchPartners()
      fetchMyHabits()
    } else {
      setPartners([])
      setMyHabits([])
      setLoading(false)
    }
  }, [userId, fetchPartners, fetchMyHabits])

  // Month navigation
  const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1))
  const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1))
  const goToCurrentMonth = () => setCurrentMonth(startOfMonth(new Date()))

  const isCurrentMonth = isSameMonth(currentMonth, new Date())

  // Calculate monthly data
  const myMonthlyData = useMemo(() =>
    calculateMonthlyData(
      userId || '',
      userProfile?.display_name || user?.email?.split('@')[0] || 'You',
      myHabits,
      currentMonth
    ),
    [userId, userProfile, user, myHabits, currentMonth]
  )

  const partnersMonthlyData = useMemo(() =>
    partners.map(partner =>
      calculateMonthlyData(
        partner.profile.id,
        partner.profile.display_name || partner.profile.email.split('@')[0],
        partner.habits,
        currentMonth
      )
    ),
    [partners, currentMonth]
  )

  // Combine and sort for leaderboard
  const allUsersData = useMemo(() => {
    const all = [myMonthlyData, ...partnersMonthlyData]
    return all.sort((a, b) => b.overallPercentage - a.overallPercentage)
  }, [myMonthlyData, partnersMonthlyData])

  if (!user) return null
  if (partners.length === 0 && !loading) return null // Don't show if no friends

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[var(--accent-500)]" />
          <span className="text-sm font-medium text-[var(--foreground)]">Monthly Comparison</span>
        </div>
      </div>

      <div className="p-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Month Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={goToPreviousMonth}
                className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] transition-colors"
              >
                <ChevronLeft size={16} className="text-[var(--muted)]" />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {format(currentMonth, 'MMMM yyyy')}
                </span>
                {!isCurrentMonth && (
                  <button
                    onClick={goToCurrentMonth}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-bg)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-hover)]"
                  >
                    This Month
                  </button>
                )}
              </div>
              <button
                onClick={goToNextMonth}
                className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] transition-colors"
                disabled={isCurrentMonth}
              >
                <ChevronRight size={16} className={isCurrentMonth ? 'text-[var(--muted-light)]' : 'text-[var(--muted)]'} />
              </button>
            </div>

            {/* Monthly Leaderboard */}
            <div className="bg-[var(--card-bg)] rounded-xl p-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)] text-center mb-3">
                Monthly Leaderboard
              </h3>
              <div className="space-y-2">
                {allUsersData.map((userData, index) => {
                  const isMe = userData.userId === userId
                  return (
                    <div
                      key={userData.userId}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                        isMe ? 'bg-[var(--accent-500)]/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[var(--muted)] w-4">
                          {index + 1}
                        </span>
                        <span className={`text-sm font-medium ${isMe ? 'text-[var(--accent-text)]' : 'text-[var(--foreground)]'}`}>
                          {userData.displayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-bold ${
                          userData.overallPercentage >= 80 ? 'text-emerald-500' :
                          userData.overallPercentage >= 60 ? 'text-amber-500' :
                          'text-[var(--foreground)]'
                        }`}>
                          {userData.overallPercentage}%
                        </span>
                        {index === 0 && <span className="text-lg">🏆</span>}
                        {index === 1 && <span className="text-lg">🥈</span>}
                        {index === 2 && <span className="text-lg">🥉</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* User Cards - Horizontal Row */}
            <div className="overflow-x-auto -mx-3 px-3 pb-2">
              <div className="flex gap-4 min-w-fit">
                {allUsersData.map((userData) => {
                  const isMe = userData.userId === userId
                  return (
                    <MonthlyUserCard
                      key={userData.userId}
                      userData={userData}
                      isCurrentUser={isMe}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MonthlyUserCard({
  userData,
  isCurrentUser
}: {
  userData: UserMonthlyData
  isCurrentUser: boolean
}) {
  if (userData.habitData.length === 0) {
    return (
      <div className={`bg-[var(--card-bg)] rounded-xl p-4 min-w-[300px] flex-shrink-0 border ${isCurrentUser ? 'border-[var(--accent-500)]/40' : 'border-[var(--card-border)]'}`}>
        <h3 className="text-base font-bold text-[var(--foreground)] text-center mb-1">
          {userData.displayName}
        </h3>
        <p className="text-xs text-[var(--muted)] text-center">No habits tracked</p>
      </div>
    )
  }

  return (
    <div className={`bg-[var(--card-bg)] rounded-xl p-4 min-w-[300px] flex-shrink-0 border ${isCurrentUser ? 'border-[var(--accent-500)]/40' : 'border-[var(--card-border)]'}`}>
      {/* User Name */}
      <h3 className="text-base font-bold text-[var(--foreground)] text-center mb-1">
        {userData.displayName}
      </h3>

      {/* Monthly Score */}
      <p className="text-xs text-[var(--muted)] text-center mb-1">
        Monthly Score:
      </p>
      <p className={`text-3xl font-bold text-center mb-4 ${
        userData.overallPercentage >= 80 ? 'text-emerald-500' :
        userData.overallPercentage >= 60 ? 'text-amber-500' :
        'text-[var(--foreground)]'
      }`}>
        {userData.overallPercentage}%
      </p>

      {/* Weekly Trend */}
      <div className="border-t border-[var(--card-border)] pt-3 mb-3">
        <p className="text-xs text-[var(--muted)] text-center mb-2">
          Weekly Trend:
        </p>
        <div className="space-y-2">
          {userData.weeklyTrend.map((week) => (
            <div key={week.weekNum} className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-[var(--muted)] w-6">
                {week.label}
              </span>
              <div className="flex-1 h-4 bg-[var(--card-border)]/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    week.percentage >= 80 ? 'bg-emerald-500' :
                    week.percentage >= 60 ? 'bg-amber-500' :
                    week.percentage >= 40 ? 'bg-blue-500' :
                    'bg-gray-400'
                  }`}
                  style={{ width: `${week.percentage}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium w-8 text-right ${
                week.percentage >= 80 ? 'text-emerald-500' :
                week.percentage >= 60 ? 'text-amber-500' :
                'text-[var(--muted)]'
              }`}>
                {week.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per Habit Breakdown */}
      <div className="border-t border-[var(--card-border)] pt-3">
        <p className="text-xs text-[var(--muted)] text-center mb-2">
          Per Habit:
        </p>
        <div className="space-y-2">
          {userData.habitData.map((habit) => (
            <div key={habit.habitId} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: habit.habitColor }}
              />
              <span className="text-[10px] text-[var(--foreground)] truncate flex-1" title={habit.habitName}>
                {habit.habitName.length > 12 ? habit.habitName.slice(0, 11) + '…' : habit.habitName}
              </span>
              <div className="w-16 h-3 bg-[var(--card-border)]/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    habit.percentage >= 80 ? 'bg-emerald-500' :
                    habit.percentage >= 60 ? 'bg-amber-500' :
                    habit.percentage >= 40 ? 'bg-blue-500' :
                    'bg-gray-400'
                  }`}
                  style={{ width: `${habit.percentage}%` }}
                />
              </div>
              <span className="text-[9px] text-[var(--muted)] w-12 text-right">
                {habit.doneCount}/{habit.totalDays}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
