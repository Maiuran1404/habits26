'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { Users, UserPlus, X, Check, Loader2, UserMinus, ChevronDown } from 'lucide-react'
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

      // Fetch profiles and habits in parallel for better performance
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

  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('friends-section-expanded')
      return saved !== null ? saved === 'true' : true
    }
    return true
  })

  // Save expanded state
  useEffect(() => {
    localStorage.setItem('friends-section-expanded', String(isExpanded))
  }, [isExpanded])

  if (!user) return null

  return (
    <div className="glass-card overflow-hidden">
      {/* Collapsible Header */}
      <div className="flex items-center justify-between p-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 flex-1"
        >
          <Users size={14} className="text-[var(--accent-500)]" />
          <span className="text-sm font-medium text-[var(--foreground)]">Friends</span>
          {partners.length > 0 && (
            <span className="text-xs text-[var(--muted)] px-1.5 py-0.5 bg-[var(--card-bg)] rounded-full">
              {partners.length}
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-[var(--muted)] transition-transform ml-auto ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="pill-button flex items-center gap-1 text-xs text-[var(--accent-text)] hover:text-[var(--accent-text-light)] transition-colors bg-[var(--accent-bg)] hover:bg-[var(--accent-bg-hover)] px-2 py-1 ml-2"
        >
          <UserPlus size={12} />
        </button>
      </div>

      {/* Collapsible Content */}
      {isExpanded && (
        <div className="px-3 pb-3">
          {/* Friends Content */}
          {loading ? (
            <div className="p-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--card-border)]" />
                <div className="h-3 w-20 bg-[var(--card-border)] rounded-full" />
              </div>
            </div>
          ) : partners.length === 0 ? (
            /* Empty State - Compact */
            <div className="text-center py-4">
              <Users className="mx-auto text-[var(--muted-light)] mb-2" size={24} />
              <p className="text-[var(--muted)] text-xs mb-2">Add friends to stay motivated</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="pill-button inline-flex items-center gap-1.5 bg-[var(--accent-500)] hover:bg-[var(--accent-400)] text-white font-medium px-3 py-1.5 text-xs"
              >
                <UserPlus size={12} />
                Add Friend
              </button>
            </div>
          ) : (
            /* Friends with Habits - Compact List */
            <div className="space-y-2">
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
        </div>
      )}

      {/* Add Friend Modal - Shows All Users */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative glass-card p-5 w-full max-w-sm max-h-[70vh] flex flex-col animate-slideUp">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 pill-button p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-bg)] flex items-center justify-center">
                <UserPlus className="text-[var(--accent-text)]" size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--foreground)]">Add Friends</h2>
                <p className="text-[var(--muted)] text-xs">Tap to add as friend</p>
              </div>
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {availableUsers.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="mx-auto text-[var(--muted-light)] mb-2" size={24} />
                  <p className="text-[var(--muted)] text-sm">
                    {allUsers.length === 0
                      ? 'No other users yet'
                      : 'You\'re friends with everyone!'}
                  </p>
                </div>
              ) : (
                availableUsers.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => handleAddFriend(profile.id)}
                    disabled={addingUserId === profile.id}
                    className="w-full flex items-center justify-between p-3 bg-[var(--card-bg)] hover:bg-[var(--accent-bg)] rounded-xl transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center text-white text-sm font-medium">
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
                    {addingUserId === profile.id ? (
                      <Loader2 size={16} className="animate-spin text-[var(--accent-text)]" />
                    ) : (
                      <UserPlus size={16} className="text-[var(--accent-text)]" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Current Friends in Modal */}
            {partners.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                <p className="text-[10px] text-[var(--muted)] uppercase tracking-wide mb-2">
                  Friends ({partners.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {partners.map((partner) => (
                    <div
                      key={partner.partnership.id}
                      className="pill-button flex items-center gap-1 px-2 py-0.5 bg-[var(--accent-bg)] text-xs"
                    >
                      <span className="text-[var(--foreground)]">
                        {partner.profile.display_name || partner.profile.email.split('@')[0]}
                      </span>
                      <Check size={10} className="text-[var(--accent-text)]" />
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

/* Friend Habits Section - Memoized and Collapsible */
const FriendHabitsSection = memo(function FriendHabitsSection({
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
  const [isOpen, setIsOpen] = useState(false)
  const progress = useMemo(
    () => calculatePartnerProgress(partner.habits, year, quarter),
    [partner.habits, year, quarter]
  )

  return (
    <div className="bg-[var(--card-bg)] rounded-xl overflow-hidden">
      {/* Friend Header - Clickable to expand */}
      <div className="flex items-center justify-between p-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
            {partner.profile.display_name?.[0]?.toUpperCase() ||
              partner.profile.email[0].toUpperCase()}
          </div>
          <span className="text-sm font-medium text-[var(--foreground)] truncate">
            {partner.profile.display_name || partner.profile.email.split('@')[0]}
          </span>
          {partner.habits.length > 0 && (
            <span className="text-[10px] font-medium text-[var(--accent-text)] flex-shrink-0">
              {progress}%
            </span>
          )}
          <ChevronDown
            size={14}
            className={`text-[var(--muted-light)] transition-transform ml-auto flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          onClick={onRemove}
          className="pill-button p-1 text-[var(--muted-light)] hover:text-red-400 hover:bg-red-500/10 transition-colors ml-1 flex-shrink-0"
          title="Remove friend"
        >
          <UserMinus size={12} />
        </button>
      </div>

      {/* Friend's Habits - Collapsible */}
      {isOpen && partner.habits.length > 0 && (
        <div className="px-2 pb-2 pt-1 border-t border-[var(--card-border)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
        </div>
      )}
    </div>
  )
})
