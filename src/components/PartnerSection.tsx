'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Users, UserPlus, X, Check, Loader2, UserMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Profile, HabitWithEntries, Quarter, Partnership, getQuarterDates } from '@/types/database'
import HabitCard from './HabitCard'
import { format, eachDayOfInterval } from 'date-fns'

interface PartnerSectionProps {
  quarter: Quarter
  year: number
}

interface PartnerData {
  partnership: Partnership
  profile: Profile
  habits: HabitWithEntries[]
}

// Calculate overall progress for a partner
function calculatePartnerProgress(habits: HabitWithEntries[], year: number, quarter: Quarter): number {
  if (habits.length === 0) return 0

  const { start, end } = getQuarterDates(year, quarter)
  const today = new Date()
  const effectiveEnd = end > today ? today : end

  if (start > today) return 0

  const daysInRange = eachDayOfInterval({ start, end: effectiveEnd })
  let totalCompleted = 0
  let totalPossible = 0

  habits.forEach(habit => {
    const completed = habit.entries.filter(
      (e) => e.status === 'done' &&
        e.date >= format(start, 'yyyy-MM-dd') &&
        e.date <= format(effectiveEnd, 'yyyy-MM-dd')
    ).length
    totalCompleted += completed
    totalPossible += daysInRange.length
  })

  return totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0
}

export default function PartnerSection({ quarter, year }: PartnerSectionProps) {
  const { user } = useAuth()
  const [partners, setPartners] = useState<PartnerData[]>([])
  const [allUsers, setAllUsers] = useState<Profile[]>([])
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [showAddModal, setShowAddModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [addingUserId, setAddingUserId] = useState<string | null>(null)

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
      // Get all partnerships (accepted)
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

      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', partnerIds)

      const { data: habits } = await supabase
        .from('habits')
        .select('*, entries:habit_entries(*)')
        .in('user_id', partnerIds)
        .eq('archived', false)

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
      // Check if partnership already exists
      const { data: existing } = await supabase
        .from('partnerships')
        .select('*')
        .or(`and(user_id.eq.${userId},partner_id.eq.${partnerId}),and(user_id.eq.${partnerId},partner_id.eq.${userId})`)
        .single()

      if (existing) {
        // Update to accepted if it exists
        await supabase
          .from('partnerships')
          .update({ status: 'accepted' })
          .eq('id', existing.id)
      } else {
        // Create new partnership with status accepted (instant add)
        await supabase
          .from('partnerships')
          .insert({
            user_id: userId,
            partner_id: partnerId,
            status: 'accepted',
          })
      }

      // Refresh the partners list
      await fetchPartners()
    } catch (error) {
      console.error('Error adding friend:', error)
    } finally {
      setAddingUserId(null)
    }
  }

  const handleRemoveFriend = async (partnershipId: string) => {
    try {
      await supabase
        .from('partnerships')
        .delete()
        .eq('id', partnershipId)

      await fetchPartners()
    } catch (error) {
      console.error('Error removing friend:', error)
    }
  }

  // Filter users who are not already friends
  const availableUsers = useMemo(() => {
    return allUsers.filter(u => !friendIds.has(u.id))
  }, [allUsers, friendIds])

  if (!user) return null

  return (
    <div className="mt-10 pt-8 border-t border-[var(--card-border)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-bg)] flex items-center justify-center border border-[var(--accent-border)]">
            <Users className="text-[var(--accent-text)]" size={16} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Friends</h2>
          {partners.length > 0 && (
            <span className="text-xs text-[var(--muted)] bg-[var(--card-bg)] px-2 py-0.5 rounded-full border border-[var(--card-border)]">
              {partners.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 text-sm text-[var(--accent-text)] hover:text-[var(--accent-text-light)] transition-colors bg-[var(--accent-bg)] hover:bg-[var(--accent-bg-hover)] px-3 py-1.5 rounded-lg border border-[var(--accent-border)]"
        >
          <UserPlus size={14} />
          Add Friend
        </button>
      </div>

      {/* Friends Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-[var(--card-bg)] rounded-xl p-4 animate-pulse border border-[var(--card-border)]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[var(--card-border)]" />
                <div>
                  <div className="h-4 w-24 bg-[var(--card-border)] rounded mb-1.5" />
                  <div className="h-3 w-16 bg-[var(--card-border)] rounded opacity-50" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : partners.length === 0 ? (
        /* Empty State - No Friends */
        <div className="text-center py-12 px-4 bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)]">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[var(--accent-bg)] flex items-center justify-center border border-[var(--accent-border)]">
            <Users className="text-[var(--accent-text)]" size={28} />
          </div>
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
            Better Together
          </h3>
          <p className="text-[var(--muted)] text-sm mb-6 max-w-xs mx-auto leading-relaxed">
            Add friends to see their habit progress alongside yours. Stay motivated and accountable together.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 bg-[var(--accent-600)] hover:bg-[var(--accent-500)] text-white font-medium px-5 py-2.5 rounded-xl transition-all hover:scale-105 shadow-lg shadow-green-500/20"
          >
            <UserPlus size={16} />
            Add Your First Friend
          </button>
        </div>
      ) : (
        /* Friends with Habits */
        <div className="space-y-6">
          {partners.map((partner) => (
            <FriendHabitsSection
              key={partner.partnership.id}
              partner={partner}
              quarter={quarter}
              year={year}
              onRemove={() => handleRemoveFriend(partner.partnership.id)}
            />
          ))}
        </div>
      )}

      {/* Add Friend Modal - Shows All Users */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative bg-[var(--card-bg)] rounded-2xl p-6 w-full max-w-md mx-4 border border-[var(--card-border)] shadow-2xl backdrop-blur max-h-[80vh] flex flex-col">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <X size={20} />
            </button>

            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[var(--accent-bg)] flex items-center justify-center border border-[var(--accent-border)]">
              <UserPlus className="text-[var(--accent-text)]" size={22} />
            </div>

            <h2 className="text-xl font-bold text-[var(--foreground)] text-center mb-1">Add Friends</h2>
            <p className="text-[var(--muted)] text-sm text-center mb-6">
              Click on any user to add them as a friend
            </p>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {availableUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto text-[var(--muted-light)] mb-3" size={32} />
                  <p className="text-[var(--muted)]">
                    {allUsers.length === 0
                      ? 'No other users yet'
                      : 'You\'re already friends with everyone!'}
                  </p>
                </div>
              ) : (
                availableUsers.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => handleAddFriend(profile.id)}
                    disabled={addingUserId === profile.id}
                    className="w-full flex items-center justify-between p-3 bg-[var(--background)] hover:bg-[var(--accent-bg)] border border-[var(--card-border)] hover:border-[var(--accent-border)] rounded-xl transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-700)] flex items-center justify-center text-white font-medium">
                        {profile.display_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-[var(--foreground)]">
                          {profile.display_name || profile.email.split('@')[0]}
                        </div>
                        <div className="text-xs text-[var(--muted-light)]">
                          {profile.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {addingUserId === profile.id ? (
                        <Loader2 size={18} className="animate-spin text-[var(--accent-text)]" />
                      ) : (
                        <UserPlus size={18} className="text-[var(--accent-text)]" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Current Friends in Modal */}
            {partners.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
                <p className="text-xs text-[var(--muted-light)] uppercase tracking-wider mb-2">
                  Current Friends ({partners.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {partners.map((partner) => (
                    <div
                      key={partner.partnership.id}
                      className="flex items-center gap-2 px-2 py-1 bg-[var(--accent-bg)] rounded-lg text-sm"
                    >
                      <span className="text-[var(--foreground)]">
                        {partner.profile.display_name || partner.profile.email.split('@')[0]}
                      </span>
                      <Check size={14} className="text-[var(--accent-text)]" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* Friend Habits Section - Shows a friend's profile and all their habits */
function FriendHabitsSection({
  partner,
  quarter,
  year,
  onRemove,
}: {
  partner: PartnerData
  quarter: Quarter
  year: number
  onRemove: () => void
}) {
  const progress = useMemo(
    () => calculatePartnerProgress(partner.habits, year, quarter),
    [partner.habits, year, quarter]
  )

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
      {/* Friend Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--card-border)] bg-[var(--accent-bg)]/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-700)] flex items-center justify-center text-white font-medium ring-2 ring-[var(--accent-500)]/30">
            {partner.profile.display_name?.[0]?.toUpperCase() ||
              partner.profile.email[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium text-[var(--foreground)]">
              {partner.profile.display_name || partner.profile.email.split('@')[0]}
            </div>
            <div className="text-xs text-[var(--muted-light)]">
              {partner.habits.length === 0
                ? 'No habits yet'
                : `${partner.habits.length} habit${partner.habits.length !== 1 ? 's' : ''}`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress indicator */}
          {partner.habits.length > 0 && (
            <div className="text-right">
              <div className="text-lg font-bold text-[var(--accent-text)]">
                {progress}%
              </div>
              <div className="text-xs text-[var(--muted-light)]">
                this sprint
              </div>
            </div>
          )}

          {/* Remove friend button */}
          <button
            onClick={onRemove}
            className="p-2 text-[var(--muted-light)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Remove friend"
          >
            <UserMinus size={16} />
          </button>
        </div>
      </div>

      {/* Friend's Habits */}
      <div className="p-4">
        {partner.habits.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[var(--card-border)] flex items-center justify-center">
              <Users className="text-[var(--muted-light)]" size={18} />
            </div>
            <p className="text-[var(--muted-light)] text-sm">
              {partner.profile.display_name || 'Your friend'} hasn&apos;t created any habits yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {partner.habits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                quarter={quarter}
                year={year}
                readonly
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
