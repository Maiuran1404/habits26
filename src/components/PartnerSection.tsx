'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Users, Loader2, Check, ChevronLeft, ChevronRight, UserPlus, X, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Profile, HabitWithEntries, Quarter, Partnership } from '@/types/database'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, isSameWeek, isAfter } from 'date-fns'
import { getWeekDays, calculateUserWeeklyData, UserWeeklyData, DayColumnData } from '@/lib/weeklyCalculations'

interface PartnerSectionProps {
  quarter: Quarter
  year: number
  userHabits: HabitWithEntries[]
}

interface PartnerData {
  partnership: Partnership
  profile: Profile
  habits: HabitWithEntries[]
}

export default function PartnerSection({ quarter, year, userHabits }: PartnerSectionProps) {
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
    } else {
      setPartners([])
      setAllUsers([])
      setLoading(false)
    }
  }, [userId, quarter, year, fetchPartners, fetchAllUsers])

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
  const weekDays = useMemo(() => getWeekDays(currentWeekStart), [currentWeekStart])

  // Calculate weekly data for current user and partners
  const myWeeklyData = useMemo(() =>
    calculateUserWeeklyData(
      userId || '',
      userProfile?.display_name || user?.email?.split('@')[0] || 'You',
      user?.email || '',
      userHabits,
      weekDays
    ),
    [userId, userProfile, user, userHabits, weekDays]
  )

  const partnersWeeklyData = useMemo(() =>
    partners.map(partner =>
      calculateUserWeeklyData(
        partner.profile.id,
        partner.profile.display_name || partner.profile.email.split('@')[0],
        partner.profile.email,
        partner.habits,
        weekDays
      )
    ),
    [partners, weekDays]
  )

  // Combine all users and sort by percentage for leaderboard
  const allUsersData = useMemo(() => {
    const all = [myWeeklyData, ...partnersWeeklyData]
    return all.sort((a, b) => b.weeklyPercentage - a.weeklyPercentage)
  }, [myWeeklyData, partnersWeeklyData])

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
            <div className="space-y-4">
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

              {/* Weekly Leaderboard */}
              <div className="bg-[var(--card-bg)] rounded-xl p-3">
                <h3 className="text-sm font-semibold text-[var(--foreground)] text-center mb-3">
                  Weekly Leaderboard
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
                            userData.weeklyPercentage >= 80 ? 'text-emerald-500' :
                            userData.weeklyPercentage >= 60 ? 'text-amber-500' :
                            'text-[var(--foreground)]'
                          }`}>
                            {userData.weeklyPercentage}%
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
                      <UserComparisonCard
                        key={userData.userId}
                        userData={userData}
                        weekDays={weekDays}
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

// User Comparison Card Component
function UserComparisonCard({
  userData,
  weekDays,
  isCurrentUser
}: {
  userData: UserWeeklyData
  weekDays: DayColumnData[]
  isCurrentUser: boolean
}) {
  if (userData.habits.length === 0) {
    return (
      <div className={`bg-[var(--card-bg)] rounded-xl p-4 min-w-[280px] flex-shrink-0 border ${isCurrentUser ? 'border-[var(--accent-500)]/40' : 'border-[var(--card-border)]'}`}>
        <h3 className="text-base font-bold text-[var(--foreground)] text-center mb-1">
          {userData.displayName}
        </h3>
        <p className="text-xs text-[var(--muted)] text-center">No habits tracked</p>
      </div>
    )
  }

  return (
    <div className={`bg-[var(--card-bg)] rounded-xl p-4 min-w-[280px] flex-shrink-0 border ${isCurrentUser ? 'border-[var(--accent-500)]/40' : 'border-[var(--card-border)]'}`}>
      {/* User Name */}
      <h3 className="text-base font-bold text-[var(--foreground)] text-center mb-1">
        {userData.displayName}
      </h3>

      {/* Total Completion */}
      <p className="text-xs text-[var(--muted)] text-center mb-1">
        Total Completion this week:
      </p>
      <p className={`text-2xl font-bold text-center mb-4 ${
        userData.weeklyPercentage >= 80 ? 'text-emerald-500' :
        userData.weeklyPercentage >= 60 ? 'text-amber-500' :
        'text-[var(--foreground)]'
      }`}>
        {userData.weeklyPercentage}%
      </p>

      {/* Completion Per Habit Label */}
      <p className="text-xs text-[var(--muted)] text-center mb-3 border-t border-[var(--card-border)] pt-3">
        Completion Per Habit:
      </p>

      {/* Habits Header Row - Names and Stats */}
      <div className="overflow-x-auto -mx-2 px-2">
        <div className="min-w-fit">
          {/* Habit Names Row */}
          <div className="flex gap-3 mb-1">
            <div className="w-8 flex-shrink-0" /> {/* Spacer for day labels */}
            {userData.habits.map((habitData) => (
              <div key={habitData.habit.id} className="w-12 flex-shrink-0 text-center">
                <span className="text-[9px] font-medium text-[var(--foreground)] truncate block" title={habitData.habit.name}>
                  {habitData.habit.name.length > 8 ? habitData.habit.name.slice(0, 7) + '…' : habitData.habit.name}
                </span>
              </div>
            ))}
          </div>

          {/* Habit Stats Row */}
          <div className="flex gap-3 mb-2">
            <div className="w-8 flex-shrink-0" /> {/* Spacer for day labels */}
            {userData.habits.map((habitData) => {
              const doneCount = habitData.weeklyDoneCount
              const targetDays = weekDays.filter(d => !d.isFuture).length
              const percentage = targetDays > 0 ? Math.round((doneCount / targetDays) * 100) : 0

              return (
                <div key={habitData.habit.id} className="w-12 flex-shrink-0 text-center">
                  <span className="text-[10px] font-semibold text-[var(--foreground)] block">
                    {doneCount}/{targetDays}
                  </span>
                  <span className={`text-[9px] font-medium ${
                    percentage >= 80 ? 'text-emerald-500' :
                    percentage >= 60 ? 'text-amber-500' :
                    'text-[var(--muted)]'
                  }`}>
                    {percentage}%
                  </span>
                </div>
              )
            })}
          </div>

          {/* Days Grid - Day label on left, dots for each habit */}
          <div className="space-y-1">
            {weekDays.map((day) => (
              <div key={day.dateStr} className="flex gap-3 items-center">
                {/* Day Label */}
                <div className={`w-8 flex-shrink-0 text-[10px] font-medium ${
                  day.isToday ? 'text-[var(--accent-text)] font-bold' : 'text-[var(--muted)]'
                }`}>
                  {format(day.date, 'EEE')[0]}
                </div>

                {/* Dots for each habit */}
                {userData.habits.map((habitData) => {
                  const entry = habitData.dailyEntries.get(day.dateStr)
                  let dotColor = 'bg-gray-300 dark:bg-gray-600' // default/empty/future

                  if (!day.isFuture) {
                    if (entry?.status === 'done') {
                      dotColor = 'bg-emerald-500'
                    } else if (entry?.status === 'missed') {
                      dotColor = 'bg-red-500'
                    } else if (entry?.status === 'skipped') {
                      dotColor = 'bg-gray-400'
                    }
                  }

                  return (
                    <div key={habitData.habit.id} className="w-12 flex-shrink-0 flex justify-center">
                      <div
                        className={`w-4 h-4 rounded-full ${dotColor} ${day.isToday ? 'ring-2 ring-offset-1 ring-[var(--accent-500)]' : ''}`}
                        title={`${format(day.date, 'EEE')}: ${entry?.status || (day.isFuture ? 'upcoming' : 'not tracked')}`}
                      />
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
