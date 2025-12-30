'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, X, Check, ChevronDown, ChevronUp, Heart, Mail, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { Profile, HabitWithEntries, Quarter, Partnership } from '@/types/database'
import HabitCard from './HabitCard'

interface PartnerSectionProps {
  quarter: Quarter
  year: number
}

interface PartnerData {
  partnership: Partnership
  profile: Profile
  habits: HabitWithEntries[]
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
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const fetchPartners = async () => {
    if (!user) return

    setLoading(true)
    try {
      const { data: partnerships } = await supabase
        .from('partnerships')
        .select('*')
        .or(`user_id.eq.${user.id},partner_id.eq.${user.id}`)
        .eq('status', 'accepted')

      if (!partnerships || partnerships.length === 0) {
        setPartners([])
        setLoading(false)
        return
      }

      const partnerIds = partnerships.map((p: Partnership) =>
        p.user_id === user.id ? p.partner_id : p.user_id
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
        const partnerId = partnership.user_id === user.id
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
    } catch (error) {
      console.error('Error fetching partners:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchPendingRequests = async () => {
    if (!user) return

    const { data } = await supabase
      .from('partnerships')
      .select('*')
      .eq('partner_id', user.id)
      .eq('status', 'pending')

    setPendingRequests(data || [])
  }

  useEffect(() => {
    fetchPartners()
    fetchPendingRequests()
  }, [user, quarter, year])

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

  const togglePartnerExpanded = (partnerId: string) => {
    setExpandedPartners((prev) => {
      const next = new Set(prev)
      if (next.has(partnerId)) {
        next.delete(partnerId)
      } else {
        next.add(partnerId)
      }
      return next
    })
  }

  if (!user) return null

  return (
    <div className="mt-10 pt-8 border-t border-[var(--card-border)]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-bg)] flex items-center justify-center border border-[var(--accent-border)]">
            <Users className="text-[var(--accent-text)]" size={16} />
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Accountability Partners</h2>
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
          Invite
        </button>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs text-[var(--muted-light)] uppercase tracking-wider mb-2">Pending Requests</p>
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

      {/* Partners List */}
      {loading ? (
        // Loading state
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-[var(--card-bg)] rounded-xl p-4 animate-pulse border border-[var(--card-border)]">
              <div className="flex items-center gap-3">
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
        // Empty state
        <div className="text-center py-12 px-4">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[var(--accent-bg)] flex items-center justify-center border border-[var(--accent-border)]">
            <Heart className="text-[var(--accent-text)]" size={28} />
          </div>
          <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">
            Better Together
          </h3>
          <p className="text-[var(--muted)] text-sm mb-6 max-w-xs mx-auto leading-relaxed">
            Invite a friend, partner, or colleague to track habits together. You&apos;ll be able to see each other&apos;s progress and stay motivated.
          </p>
          <button
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-medium px-5 py-2.5 rounded-xl transition-all hover:scale-105 shadow-lg shadow-green-500/20"
          >
            <UserPlus size={16} />
            Invite Your First Partner
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {partners.map((partner) => (
            <div
              key={partner.partnership.id}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden hover:border-[var(--card-hover-border)] transition-colors"
            >
              <button
                onClick={() => togglePartnerExpanded(partner.profile.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-[var(--accent-bg)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-600)] to-[var(--accent-700)] flex items-center justify-center text-white font-medium ring-2 ring-[var(--accent-500)]">
                    {partner.profile.display_name?.[0]?.toUpperCase() ||
                      partner.profile.email[0].toUpperCase()}
                  </div>
                  <div className="text-left">
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
                {expandedPartners.has(partner.profile.id) ? (
                  <ChevronUp className="text-[var(--muted)]" size={20} />
                ) : (
                  <ChevronDown className="text-[var(--muted)]" size={20} />
                )}
              </button>

              {expandedPartners.has(partner.profile.id) && (
                <div className="border-t border-[var(--card-border)] p-4 space-y-3 bg-[var(--card-bg)]">
                  {partner.habits.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[var(--card-border)] flex items-center justify-center">
                        <Users className="text-[var(--muted-light)]" size={18} />
                      </div>
                      <p className="text-[var(--muted-light)] text-sm">
                        {partner.profile.display_name || 'Your partner'} hasn&apos;t created any habits yet
                      </p>
                    </div>
                  ) : (
                    partner.habits.map((habit) => (
                      <HabitCard
                        key={habit.id}
                        habit={habit}
                        quarter={quarter}
                        year={year}
                        readonly
                      />
                    ))
                  )}
                </div>
              )}
            </div>
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

            <h2 className="text-xl font-bold text-[var(--foreground)] text-center mb-1">Invite a Partner</h2>
            <p className="text-[var(--muted)] text-sm text-center mb-6">
              They&apos;ll receive a request to connect
            </p>

            {inviteSuccess ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--accent-bg)] flex items-center justify-center">
                  <Check className="text-[var(--accent-text)]" size={24} />
                </div>
                <p className="text-[var(--accent-text)] font-medium">Invitation Sent!</p>
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
                      placeholder="partner@example.com"
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
                        'Send Invite'
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
  const supabase = createClient()

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
  }, [request.user_id])

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
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-500)] to-[var(--accent-600)] flex items-center justify-center text-white font-medium">
          {profile.display_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-[var(--foreground)]">
            {profile.display_name || profile.email.split('@')[0]}
          </div>
          <div className="text-xs text-[var(--accent-text)]">Wants to connect with you</div>
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
