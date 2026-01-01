'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { TrendingUp, Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Profile, HabitWithEntries, Partnership, Quarter, getQuarterDates } from '@/types/database'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  eachMonthOfInterval,
} from 'date-fns'

interface QuarterlyComparisonProps {
  quarter: Quarter
  year: number
  userHabits: HabitWithEntries[]
}

interface PartnerData {
  partnership: Partnership
  profile: Profile
  habits: HabitWithEntries[]
}

interface MonthData {
  month: Date
  label: string
  percentage: number
  doneCount: number
  totalPossible: number
}

interface HabitQuarterlyData {
  habitId: string
  habitName: string
  habitColor: string
  doneCount: number
  totalDays: number
  percentage: number
}

interface UserQuarterlyData {
  userId: string
  displayName: string
  overallPercentage: number
  monthlyTrend: MonthData[]
  habitData: HabitQuarterlyData[]
  totalDone: number
  totalPossible: number
}

function calculateQuarterlyData(
  userId: string,
  displayName: string,
  habits: HabitWithEntries[],
  quarter: Quarter,
  year: number
): UserQuarterlyData {
  const { start: quarterStart, end: quarterEnd } = getQuarterDates(year, quarter)
  const today = new Date()
  const effectiveEnd = quarterEnd > today ? today : quarterEnd

  // Get all days in quarter up to today
  const daysInQuarter = eachDayOfInterval({
    start: quarterStart,
    end: effectiveEnd
  })

  const pastDays = daysInQuarter.filter(d => d <= today)

  // Calculate monthly breakdown
  const monthsInQuarter = eachMonthOfInterval({
    start: quarterStart,
    end: effectiveEnd
  })

  const monthlyTrend: MonthData[] = monthsInQuarter.map(monthStart => {
    const monthEnd = endOfMonth(monthStart)
    const effectiveMonthEnd = monthEnd > today ? today : monthEnd

    if (monthStart > today) {
      return {
        month: monthStart,
        label: format(monthStart, 'MMM'),
        percentage: 0,
        doneCount: 0,
        totalPossible: 0
      }
    }

    const daysInMonth = eachDayOfInterval({
      start: monthStart,
      end: effectiveMonthEnd
    }).filter(d => d <= today)

    let doneCount = 0
    habits.forEach(habit => {
      habit.entries.forEach(entry => {
        if (entry.status === 'done') {
          const entryDate = new Date(entry.date)
          if (entryDate >= monthStart && entryDate <= effectiveMonthEnd) {
            doneCount++
          }
        }
      })
    })

    const totalPossible = daysInMonth.length * habits.length
    const percentage = totalPossible > 0 ? Math.round((doneCount / totalPossible) * 100) : 0

    return {
      month: monthStart,
      label: format(monthStart, 'MMM'),
      percentage,
      doneCount,
      totalPossible
    }
  })

  // Calculate per-habit quarterly data
  const habitData: HabitQuarterlyData[] = habits.map(habit => {
    const doneCount = habit.entries.filter(entry => {
      if (entry.status !== 'done') return false
      const entryDate = new Date(entry.date)
      return entryDate >= quarterStart && entryDate <= effectiveEnd
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
    monthlyTrend,
    habitData,
    totalDone,
    totalPossible
  }
}

const quarterOptions: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4']

export default function QuarterlyComparison({ quarter: initialQuarter, year: initialYear, userHabits }: QuarterlyComparisonProps) {
  const { user, profile: userProfile } = useAuth()
  const [partners, setPartners] = useState<PartnerData[]>([])
  const [loading, setLoading] = useState(true)
  const [currentQuarter, setCurrentQuarter] = useState<Quarter>(initialQuarter)
  const [currentYear, setCurrentYear] = useState(initialYear)
  const [isCollapsed, setIsCollapsed] = useState(true)

  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id

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
    } else {
      setPartners([])
      setLoading(false)
    }
  }, [userId, fetchPartners])

  // Quarter navigation
  const goToPreviousQuarter = () => {
    const currentIndex = quarterOptions.indexOf(currentQuarter)
    if (currentIndex === 0) {
      setCurrentQuarter('Q4')
      setCurrentYear(prev => prev - 1)
    } else {
      setCurrentQuarter(quarterOptions[currentIndex - 1])
    }
  }

  const goToNextQuarter = () => {
    const currentIndex = quarterOptions.indexOf(currentQuarter)
    if (currentIndex === 3) {
      setCurrentQuarter('Q1')
      setCurrentYear(prev => prev + 1)
    } else {
      setCurrentQuarter(quarterOptions[currentIndex + 1])
    }
  }

  const goToCurrentQuarter = () => {
    const now = new Date()
    const month = now.getMonth()
    const q: Quarter = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4'
    setCurrentQuarter(q)
    setCurrentYear(now.getFullYear())
  }

  const isCurrentQuarter = useMemo(() => {
    const now = new Date()
    const month = now.getMonth()
    const currentQ: Quarter = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4'
    return currentQuarter === currentQ && currentYear === now.getFullYear()
  }, [currentQuarter, currentYear])

  const isFutureQuarter = useMemo(() => {
    const now = new Date()
    const month = now.getMonth()
    const currentQ: Quarter = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4'
    const currentQIndex = quarterOptions.indexOf(currentQ)
    const selectedQIndex = quarterOptions.indexOf(currentQuarter)

    if (currentYear > now.getFullYear()) return true
    if (currentYear === now.getFullYear() && selectedQIndex > currentQIndex) return true
    return false
  }, [currentQuarter, currentYear])

  // Calculate quarterly data
  const myQuarterlyData = useMemo(() =>
    calculateQuarterlyData(
      userId || '',
      userProfile?.display_name || user?.email?.split('@')[0] || 'You',
      userHabits,
      currentQuarter,
      currentYear
    ),
    [userId, userProfile, user, userHabits, currentQuarter, currentYear]
  )

  const partnersQuarterlyData = useMemo(() =>
    partners.map(partner =>
      calculateQuarterlyData(
        partner.profile.id,
        partner.profile.display_name || partner.profile.email.split('@')[0],
        partner.habits,
        currentQuarter,
        currentYear
      )
    ),
    [partners, currentQuarter, currentYear]
  )

  // Combine and sort for leaderboard
  const allUsersData = useMemo(() => {
    const all = [myQuarterlyData, ...partnersQuarterlyData]
    return all.sort((a, b) => b.overallPercentage - a.overallPercentage)
  }, [myQuarterlyData, partnersQuarterlyData])

  if (!user) return null
  if (partners.length === 0 && !loading) return null

  const quarterLabel = `${currentQuarter} ${currentYear}`

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-3 border-b border-[var(--card-border)] hover:bg-[var(--card-bg)]/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-[var(--accent-500)]" />
          <span className="text-sm font-medium text-[var(--foreground)]">Quarterly Comparison</span>
        </div>
        {isCollapsed ? (
          <ChevronDown size={16} className="text-[var(--muted)]" />
        ) : (
          <ChevronUp size={16} className="text-[var(--muted)]" />
        )}
      </button>

      {!isCollapsed && <div className="p-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quarter Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={goToPreviousQuarter}
                className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] transition-colors"
              >
                <ChevronLeft size={16} className="text-[var(--muted)]" />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {quarterLabel}
                </span>
                {!isCurrentQuarter && (
                  <button
                    onClick={goToCurrentQuarter}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-bg)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-hover)]"
                  >
                    This Quarter
                  </button>
                )}
              </div>
              <button
                onClick={goToNextQuarter}
                className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] transition-colors"
                disabled={isCurrentQuarter || isFutureQuarter}
              >
                <ChevronRight size={16} className={(isCurrentQuarter || isFutureQuarter) ? 'text-[var(--muted-light)]' : 'text-[var(--muted)]'} />
              </button>
            </div>

            {/* Quarterly Leaderboard */}
            <div className="bg-[var(--card-bg)] rounded-xl p-3">
              <h3 className="text-sm font-semibold text-[var(--foreground)] text-center mb-3">
                Quarterly Leaderboard
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
                    <QuarterlyUserCard
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
      }
    </div>
  )
}

function QuarterlyUserCard({
  userData,
  isCurrentUser
}: {
  userData: UserQuarterlyData
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

      {/* Quarterly Score */}
      <p className="text-xs text-[var(--muted)] text-center mb-1">
        Quarterly Score:
      </p>
      <p className={`text-3xl font-bold text-center mb-4 ${
        userData.overallPercentage >= 80 ? 'text-emerald-500' :
        userData.overallPercentage >= 60 ? 'text-amber-500' :
        'text-[var(--foreground)]'
      }`}>
        {userData.overallPercentage}%
      </p>

      {/* Monthly Trend */}
      <div className="border-t border-[var(--card-border)] pt-3 mb-3">
        <p className="text-xs text-[var(--muted)] text-center mb-2">
          Monthly Trend:
        </p>
        <div className="space-y-2">
          {userData.monthlyTrend.map((month) => (
            <div key={month.label} className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-[var(--muted)] w-8">
                {month.label}
              </span>
              <div className="flex-1 h-5 bg-[var(--card-border)]/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    month.percentage >= 80 ? 'bg-emerald-500' :
                    month.percentage >= 60 ? 'bg-amber-500' :
                    month.percentage >= 40 ? 'bg-blue-500' :
                    'bg-gray-400'
                  }`}
                  style={{ width: `${month.percentage}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium w-8 text-right ${
                month.percentage >= 80 ? 'text-emerald-500' :
                month.percentage >= 60 ? 'text-amber-500' :
                'text-[var(--muted)]'
              }`}>
                {month.percentage}%
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
              <span className="text-[9px] text-[var(--muted)] w-14 text-right">
                {habit.doneCount}/{habit.totalDays}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
