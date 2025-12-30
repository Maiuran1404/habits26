'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Users, UserPlus, X, Check, Heart, Mail, Loader2 } from 'lucide-react'
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
  const [pendingRequests, setPendingRequests] = useState<Partnership[]>([])
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = useMemo(() => createClient(), [])
  const userId = user?.id

  const fetchPartners = useCallback(async () => {
    if (!userId) {
      setPartners([])
      setLoading(false)
      return
    }

    setLoading(true)

    // Timeout safety net (5 seconds)
    const timeout = setTimeout(() => {
      console.warn('Partners fetch timed out - check if database tables exist')
      setPartners([])
      setLoading(false)
    }, 5000)

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
        setLoading(false)
        return
      }

      const partnerIds = partnerships.map((p: Partnership) =>
        p.user_id === userId ? p.partner_id : p.user_id
      )

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

  const fetchPendingRequests = useCallback(async () => {
    if (!userId) {
      setPendingRequests([])
      return
    }

    try {
      const { data, error } = await supabase
        .from('partnerships')
        .select('*')
        .eq('partner_id', userId)
        .eq('status', 'pending')

      if (error) {
        console.error('Error fetching pending requests:', error)
        setPendingRequests([])
      } else {
        setPendingRequests(data || [])
      }
    } catch (err) {
      console.error('Error fetching pending requests:', err)
      setPendingRequests([])
    }
  }, [userId, supabase])

  useEffect(() => {
    if (userId) {
      fetchPartners()
      fetchPendingRequests()
    } else {
      setPartners([])
      setPendingRequests([])
      setLoading(false)
    }
  }, [userId, quarter, year, fetchPartners, fetchPendingRequests])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !inviteEmail.trim()) return

    setInviteLoading(true)
    setInviteError(null)
    setInviteSuccess(false)

    try {
      const { data: foundUsers, error: findError } = await supabase
        .rpc('find_user_by_email', { search_email: inviteEmail.trim() })

      if (findError) throw findError
      if (!foundUsers || foundUsers.length === 0) {
        setInviteError('No user found with that email. They need to sign up first.')
        setInviteLoading(false)
        return
      }

      const partnerId = foundUsers[0].id

      if (partnerId === user.id) {
        setInviteError("You can't add yourself as a partner")
        setInviteLoading(false)
        return
      }

      const { data: existing } = await supabase
        .from('partnerships')
        .select('*')
        .or(`and(user_id.eq.${user.id},partner_id.eq.${partnerId}),and(user_id.eq.${partnerId},partner_id.eq.${user.id})`)
        .single()

      if (existing) {
        setInviteError('Partnership already exists with this user')
        setInviteLoading(false)
        return
      }

      const { error: insertError } = await supabase
        .from('partnerships')
        .insert({
          user_id: user.id,
          partner_id: partnerId,
          status: 'pending',
        })

      if (insertError) throw insertError

      setInviteSuccess(true)
      setInviteEmail('')
      setTimeout(() => {
        setShowInviteModal(false)
        setInviteSuccess(false)
      }, 1500)
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : 'Failed to send invite')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleAcceptRequest = async (partnershipId: string) => {
    const { error } = await supabase
      .from('partnerships')
      .update({ status: 'accepted' })
      .eq('id', partnershipId)

    if (!error) {
      fetchPendingRequests()
      fetchPartners()
    }
  }

  const handleRejectRequest = async (partnershipId: string) => {
    const { error } = await supabase
      .from('partnerships')
      .update({ status: 'rejected' })
      .eq('id', partnershipId)

    if (!error) {
      fetchPendingRequests()
    }
  }

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
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-1.5 text-sm text-[var(--accent-text)] hover:text-[var(--accent-text-light)] transition-colors bg-[var(--accent-bg)] hover:bg-[var(--accent-bg-hover)] px-3 py-1.5 rounded-lg border border-[var(--accent-border)]"
        >
          <UserPlus size={14} />
          Add Friend
        </button>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs text-[var(--muted-light)] uppercase tracking-wider mb-2">Friend Requests</p>
          {pendingRequests.map((request) => (
            <PendingRequestCard
              key={request.id}
              request={request}
              onAccept={() => handleAcceptRequest(request.id)}
              onReject={() => handleRejectRequest(request.id)}
            />
          ))}
        </div>
      )}

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
            onClick={() => setShowInviteModal(true)}
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
            />
          ))}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !inviteLoading && setShowInviteModal(false)}
          />
          <div className="relative bg-[var(--card-bg)] rounded-2xl p-6 w-full max-w-md mx-4 border border-[var(--card-border)] shadow-2xl backdrop-blur">
            <button
              onClick={() => !inviteLoading && setShowInviteModal(false)}
              className="absolute top-4 right-4 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <X size={20} />
            </button>

            <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[var(--accent-bg)] flex items-center justify-center border border-[var(--accent-border)]">
              <UserPlus className="text-[var(--accent-text)]" size={22} />
            </div>

            <h2 className="text-xl font-bold text-[var(--foreground)] text-center mb-1">Add a Friend</h2>
            <p className="text-[var(--muted)] text-sm text-center mb-6">
              They&apos;ll receive a request to connect
            </p>

            {inviteSuccess ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--accent-bg)] flex items-center justify-center">
                  <Check className="text-[var(--accent-text)]" size={24} />
                </div>
                <p className="text-[var(--accent-text)] font-medium">Request Sent!</p>
              </div>
            ) : (
              <>
                {inviteError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {inviteError}
                  </div>
                )}

                <form onSubmit={handleInvite} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-light)]" size={18} />
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="friend@example.com"
                      required
                      disabled={inviteLoading}
                      className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg py-2.5 pl-10 pr-4 text-[var(--foreground)] placeholder-[var(--muted-light)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors disabled:opacity-50"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      disabled={inviteLoading}
                      className="flex-1 bg-[var(--card-border)] hover:bg-[var(--card-hover-border)] disabled:opacity-50 text-[var(--foreground)] font-medium py-2.5 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviteLoading || !inviteEmail.trim()}
                      className="flex-1 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                      {inviteLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Request'
                      )}
                    </button>
                  </div>
                </form>
              </>
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
}: {
  partner: PartnerData
  quarter: Quarter
  year: number
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

/* Pending Request Card */
function PendingRequestCard({
  request,
  onAccept,
  onReject,
}: {
  request: Partnership
  onAccept: () => void
  onReject: () => void
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', request.user_id)
        .single()

      if (data) setProfile(data as Profile)
      setLoading(false)
    }
    fetchProfile()
  }, [request.user_id, supabase])

  if (loading) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--accent-border)] rounded-xl p-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--card-border)]" />
          <div>
            <div className="h-4 w-24 bg-[var(--card-border)] rounded mb-1" />
            <div className="h-3 w-16 bg-[var(--card-border)] rounded opacity-50" />
          </div>
        </div>
      </div>
    )
  }

  if (!profile) return null

  return (
    <div className="bg-[var(--accent-bg)] border border-[var(--accent-border)] rounded-xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-700)] flex items-center justify-center text-white font-medium">
          {profile.display_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-[var(--foreground)]">
            {profile.display_name || profile.email.split('@')[0]}
          </div>
          <div className="text-xs text-[var(--accent-text)]">Wants to be friends</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onReject}
          className="p-2 text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Decline"
        >
          <X size={18} />
        </button>
        <button
          onClick={onAccept}
          className="p-2 text-[var(--accent-text)] hover:text-[var(--accent-text-light)] hover:bg-[var(--accent-bg-hover)] rounded-lg transition-colors"
          title="Accept"
        >
          <Check size={18} />
        </button>
      </div>
    </div>
  )
}
