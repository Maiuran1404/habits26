'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Users, Loader2, Check, ChevronLeft, ChevronRight, UserPlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Profile, HabitWithEntries, Quarter, Partnership } from '@/types/database'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameWeek } from 'date-fns'

interface PartnerSectionProps {
  quarter: Quarter
  year: number
}

interface PartnerData {
  partnership: Partnership
  profile: Profile
  habits: HabitWithEntries[]
}

// Calculate weekly progress for habits
function calculateWeekProgress(habits: HabitWithEntries[], weekStart: Date): { completed: number; total: number; percentage: number } {
  if (habits.length === 0) return { completed: 0, total: 0, percentage: 0 }

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const today = new Date()
  const effectiveEnd = weekEnd > today ? today : weekEnd

  if (weekStart > today) return { completed: 0, total: 0, percentage: 0 }

  const daysInRange = eachDayOfInterval({ start: weekStart, end: effectiveEnd })
  let totalCompleted = 0
  let totalPossible = 0

  habits.forEach(habit => {
    const completed = habit.entries.filter(
      (e) => e.status === 'done' &&
        e.date >= format(weekStart, 'yyyy-MM-dd') &&
        e.date <= format(effectiveEnd, 'yyyy-MM-dd')
    ).length
    totalCompleted += completed
    totalPossible += daysInRange.length
  })

  const percentage = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0
  return { completed: totalCompleted, total: totalPossible, percentage }
}

export default function PartnerSection({ quarter, year }: PartnerSectionProps) {
  const { user, profile: userProfile } = useAuth()
  const [partners, setPartners] = useState<PartnerData[]>([])
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [addingUserId, setAddingUserId] = useState<string | null>(null)
  const [removingUserId, setRemovingUserId] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [currentWeekStart, setCurrentWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )

  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id

  // Fetch user's own habits
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
        console.error('Error fetching my habits:', error)
        setMyHabits([])
      } else {
        setMyHabits(data as HabitWithEntries[] || [])
      }
    } catch (err) {
      console.error('Error fetching my habits:', err)
      setMyHabits([])
    }
  }, [userId, supabase])

  const fetchPartners = useCallback(async () => {
    if (!userId) {
      setPartners([])
      setFriendIds(new Set())
      setLoading(false)
      return
    }

    setLoading(true)

    const timeout = setTimeout(() => {
      console.warn('Partners fetch timed out')
      setPartners([])
      setLoading(false)
    }, 3000)

    try {
      const { data: partnerships, error: partnershipError } = await supabase
        .from('partnerships')
        .select('*')
        .or(`user_id.eq.${userId},partner_id.eq.${userId}`)
        .eq('status', 'accepted')

      if (partnershipError) {
        clearTimeout(timeout)
        console.error('Error fetching partnerships:', partnershipError)
        setPartners([])
        setLoading(false)
        return
      }

      if (!partnerships || partnerships.length === 0) {
        clearTimeout(timeout)
        setPartners([])
        setFriendIds(new Set())
        setLoading(false)
        return
      }

      const partnerIds = partnerships.map((p: Partnership) =>
        p.user_id === userId ? p.partner_id : p.user_id
      )

      setFriendIds(new Set(partnerIds))

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

      clearTimeout(timeout)
      setPartners(partnerData)
    } catch (error) {
      clearTimeout(timeout)
      console.error('Error fetching partners:', error)
      setPartners([])
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  const fetchAllUsers = useCallback(async () => {
    if (!userId) {
      setAllUsers([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', userId)
        .order('display_name', { ascending: true })

      if (error) {
        console.error('Error fetching users:', error)
        setAllUsers([])
      } else {
        setAllUsers(data || [])
      }
    } catch (err) {
      console.error('Error fetching users:', err)
      setAllUsers([])
    }
  }, [userId, supabase])

  useEffect(() => {
    if (userId) {
      fetchPartners()
      fetchAllUsers()
      fetchMyHabits()
    } else {
      setPartners([])
      setAllUsers([])
      setMyHabits([])
      setLoading(false)
    }
  }, [userId, quarter, year, fetchPartners, fetchAllUsers, fetchMyHabits])

  const handleAddFriend = async (partnerId: string) => {
    if (!userId) return

    setAddingUserId(partnerId)

    try {
      const { data: existing } = await supabase
        .from('partnerships')
        .select('*')
        .or(`and(user_id.eq.${userId},partner_id.eq.${partnerId}),and(user_id.eq.${partnerId},partner_id.eq.${userId})`)
        .single()

      if (existing) {
        await supabase
          .from('partnerships')
          .update({ status: 'accepted' })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('partnerships')
          .insert({
            user_id: userId,
            partner_id: partnerId,
            status: 'accepted',
          })
      }

      await fetchPartners()
    } catch (error) {
      console.error('Error adding friend:', error)
    } finally {
      setAddingUserId(null)
    }
  }

  const handleRemoveFriend = async (partnershipId: string, profileId: string) => {
    setRemovingUserId(profileId)
    try {
      await supabase
        .from('partnerships')
        .delete()
        .eq('id', partnershipId)

      await fetchPartners()
    } catch (error) {
      console.error('Error removing friend:', error)
    } finally {
      setRemovingUserId(null)
    }
  }

  // Week navigation
  const goToPreviousWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1))
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1))
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))

  const isCurrentWeek = isSameWeek(currentWeekStart, new Date(), { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd })

  // Calculate progress for current week
  const myProgress = useMemo(() => calculateWeekProgress(myHabits, currentWeekStart), [myHabits, currentWeekStart])

  if (!user) return null

  return (
    <>
      <div className="glass-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-[var(--accent-500)]" />
            <span className="text-sm font-medium text-[var(--foreground)]">Weekly Comparison</span>
            {partners.length > 0 && (
              <span className="text-xs text-[var(--muted)] px-1.5 py-0.5 bg-[var(--card-bg)] rounded-full">
                {partners.length} friend{partners.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--accent-text)] transition-colors"
          >
            <UserPlus size={14} />
            <span className="hidden sm:inline">Add Friends</span>
          </button>
        </div>

        <div className="p-3">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin text-[var(--muted)]" />
            </div>
          ) : partners.length === 0 ? (
            /* Empty State */
            <div className="text-center py-6">
              <Users className="mx-auto text-[var(--muted-light)] mb-2" size={28} />
              <p className="text-sm text-[var(--muted)] mb-3">Add friends to compare progress</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[var(--accent-bg)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-hover)] transition-colors"
              >
                <UserPlus size={12} />
                Add Friends
              </button>
            </div>
          ) : (
            /* Weekly Comparison View */
            <div className="space-y-3">
              {/* Week Navigation */}
              <div className="flex items-center justify-between">
                <button
                  onClick={goToPreviousWeek}
                  className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] transition-colors"
                >
                  <ChevronLeft size={16} className="text-[var(--muted)]" />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    {format(currentWeekStart, 'MMM d')} - {format(weekEnd, 'MMM d')}
                  </span>
                  {!isCurrentWeek && (
                    <button
                      onClick={goToCurrentWeek}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-bg)] text-[var(--accent-text)] hover:bg-[var(--accent-bg-hover)]"
                    >
                      Today
                    </button>
                  )}
                </div>
                <button
                  onClick={goToNextWeek}
                  className="p-1.5 rounded-lg hover:bg-[var(--card-bg)] transition-colors"
                  disabled={isCurrentWeek}
                >
                  <ChevronRight size={16} className={isCurrentWeek ? 'text-[var(--muted-light)]' : 'text-[var(--muted)]'} />
                </button>
              </div>

              {/* Comparison Grid */}
              <div className="overflow-x-auto -mx-3 px-3">
                <div className="min-w-fit">
                  {/* Header Row - Days of Week */}
                  <div className="flex gap-1 mb-2">
                    <div className="w-20 flex-shrink-0" />
                    {weekDays.map((day) => (
                      <div
                        key={day.toISOString()}
                        className={`w-9 h-6 flex items-center justify-center text-[10px] font-medium ${
                          format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                            ? 'text-[var(--accent-text)]'
                            : 'text-[var(--muted)]'
                        }`}
                      >
                        {format(day, 'EEE')[0]}
                      </div>
                    ))}
                    <div className="w-14 flex-shrink-0 text-[10px] text-[var(--muted)] text-right pr-1">
                      Score
                    </div>
                  </div>

                  {/* My Progress Row */}
                  <div className="flex gap-1 items-center mb-1.5 p-2 rounded-xl bg-[var(--accent-500)]/10 border border-[var(--accent-500)]/20">
                    <div className="w-20 flex-shrink-0 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center text-white text-xs font-medium">
                        {userProfile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs font-medium text-[var(--foreground)]">You</span>
                    </div>
                    {weekDays.map((day) => {
                      const dayStr = format(day, 'yyyy-MM-dd')
                      const today = new Date()
                      const isFuture = day > today
                      const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')

                      const completedCount = myHabits.filter(habit =>
                        habit.entries.some(e => e.date === dayStr && e.status === 'done')
                      ).length
                      const totalHabits = myHabits.length
                      const allDone = totalHabits > 0 && completedCount === totalHabits
                      const someDone = completedCount > 0

                      return (
                        <div
                          key={day.toISOString()}
                          className={`
                            w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold transition-all
                            ${isFuture
                              ? 'bg-[var(--card-border)]/30'
                              : allDone
                                ? 'bg-[var(--accent-500)] text-white shadow-sm'
                                : someDone
                                  ? 'bg-[var(--accent-500)]/30 text-[var(--accent-600)]'
                                  : 'bg-[var(--card-bg)] text-[var(--muted-light)]'
                            }
                            ${isToday ? 'ring-2 ring-[var(--accent-500)] ring-offset-1 ring-offset-[var(--background)]' : ''}
                          `}
                          title={`${completedCount}/${totalHabits} habits`}
                        >
                          {!isFuture && totalHabits > 0 ? completedCount : ''}
                        </div>
                      )
                    })}
                    <div className="w-14 flex-shrink-0 text-right pr-1">
                      <span className={`text-sm font-bold ${myProgress.percentage >= 70 ? 'text-[var(--accent-500)]' : 'text-[var(--foreground)]'}`}>
                        {myProgress.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Partner Rows */}
                  {partners.map((partner, index) => {
                    const partnerProgress = calculateWeekProgress(partner.habits, currentWeekStart)
                    const colors = ['blue', 'purple', 'orange', 'pink', 'cyan']
                    const color = colors[index % colors.length]

                    return (
                      <div key={partner.partnership.id} className="flex gap-1 items-center mb-1.5 p-2 rounded-xl hover:bg-[var(--card-bg)]/50 transition-colors">
                        <div className="w-20 flex-shrink-0 flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br from-${color}-500 to-${color}-600 flex items-center justify-center text-white text-xs font-medium`}
                            style={{
                              background: `linear-gradient(to bottom right, var(--${color}-500, #3b82f6), var(--${color}-600, #2563eb))`
                            }}
                          >
                            {partner.profile.display_name?.[0]?.toUpperCase() || partner.profile.email[0].toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-[var(--foreground)] truncate max-w-[48px]">
                            {partner.profile.display_name || partner.profile.email.split('@')[0]}
                          </span>
                        </div>
                        {weekDays.map((day) => {
                          const dayStr = format(day, 'yyyy-MM-dd')
                          const today = new Date()
                          const isFuture = day > today
                          const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')

                          const completedCount = partner.habits.filter(habit =>
                            habit.entries.some(e => e.date === dayStr && e.status === 'done')
                          ).length
                          const totalHabits = partner.habits.length
                          const allDone = totalHabits > 0 && completedCount === totalHabits
                          const someDone = completedCount > 0

                          return (
                            <div
                              key={day.toISOString()}
                              className={`
                                w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold transition-all
                                ${isFuture
                                  ? 'bg-[var(--card-border)]/30'
                                  : allDone
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : someDone
                                      ? 'bg-blue-500/30 text-blue-600'
                                      : 'bg-[var(--card-bg)] text-[var(--muted-light)]'
                                }
                                ${isToday ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[var(--background)]' : ''}
                              `}
                              title={`${completedCount}/${totalHabits} habits`}
                            >
                              {!isFuture && totalHabits > 0 ? completedCount : ''}
                            </div>
                          )
                        })}
                        <div className="w-14 flex-shrink-0 text-right pr-1">
                          <span className={`text-sm font-bold ${partnerProgress.percentage >= 70 ? 'text-blue-500' : 'text-[var(--foreground)]'}`}>
                            {partnerProgress.percentage}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 pt-2 border-t border-[var(--card-border)]">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-[var(--accent-500)]" />
                  <span className="text-[10px] text-[var(--muted)]">All done</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-[var(--accent-500)]/30" />
                  <span className="text-[10px] text-[var(--muted)]">Partial</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-[var(--card-bg)] border border-[var(--card-border)]" />
                  <span className="text-[10px] text-[var(--muted)]">None</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Friends Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative glass-card p-4 w-full max-w-sm max-h-[70vh] flex flex-col animate-slideUp">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-[var(--accent-500)]" />
                <h2 className="text-base font-semibold text-[var(--foreground)]">Add Friends</h2>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {allUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto text-[var(--muted-light)] mb-2" size={24} />
                  <p className="text-sm text-[var(--muted)]">No other users yet</p>
                </div>
              ) : (
                allUsers.map((profile) => {
                  const isFriend = friendIds.has(profile.id)
                  const partner = partners.find(p => p.profile.id === profile.id)
                  const isAdding = addingUserId === profile.id
                  const isRemoving = removingUserId === profile.id
                  const isLoading = isAdding || isRemoving

                  return (
                    <button
                      key={profile.id}
                      onClick={() => {
                        if (isFriend && partner) {
                          handleRemoveFriend(partner.partnership.id, profile.id)
                        } else {
                          handleAddFriend(profile.id)
                        }
                      }}
                      disabled={isLoading}
                      className={`
                        w-full flex items-center justify-between p-3 rounded-xl transition-all
                        ${isFriend
                          ? 'bg-[var(--accent-bg)] border border-[var(--accent-500)]'
                          : 'bg-[var(--card-bg)] border border-transparent hover:border-[var(--accent-500)]/50'
                        }
                        disabled:opacity-50
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-medium
                          ${isFriend
                            ? 'bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)]'
                            : 'bg-gradient-to-br from-gray-400 to-gray-500'
                          }
                        `}>
                          {profile.display_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-medium text-[var(--foreground)]">
                            {profile.display_name || profile.email.split('@')[0]}
                          </div>
                          <div className="text-[10px] text-[var(--muted)]">
                            {profile.email}
                          </div>
                        </div>
                      </div>
                      {isLoading ? (
                        <Loader2 size={18} className="animate-spin text-[var(--accent-text)]" />
                      ) : isFriend ? (
                        <div className="flex items-center gap-1 text-xs text-[var(--accent-text)]">
                          <Check size={14} />
                          <span>Added</span>
                        </div>
                      ) : (
                        <UserPlus size={18} className="text-[var(--muted)]" />
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {partners.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                <p className="text-[10px] text-[var(--muted)] mb-2">
                  {partners.length} friend{partners.length !== 1 ? 's' : ''} added
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
