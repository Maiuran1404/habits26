'use client'

import { useState, useEffect } from 'react'
import { Users, UserPlus, X, Check, ChevronDown, ChevronUp } from 'lucide-react'
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
  const [expandedPartners, setExpandedPartners] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  const fetchPartners = async () => {
    if (!user) return

    setLoading(true)
    try {
      // Get accepted partnerships where user is either requester or partner
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

      // Get partner IDs (the other person in each partnership)
      const partnerIds = partnerships.map((p: Partnership) =>
        p.user_id === user.id ? p.partner_id : p.user_id
      )

      // Fetch partner profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', partnerIds)

      // Fetch partner habits with entries
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

    try {
      // Find user by email
      const { data: foundUsers, error: findError } = await supabase
        .rpc('find_user_by_email', { search_email: inviteEmail.trim() })

      if (findError) throw findError
      if (!foundUsers || foundUsers.length === 0) {
        setInviteError('No user found with that email')
        setInviteLoading(false)
        return
      }

      const partnerId = foundUsers[0].id

      if (partnerId === user.id) {
        setInviteError("You can't add yourself as a partner")
        setInviteLoading(false)
        return
      }

      // Check if partnership already exists
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

      // Create partnership request
      const { error: insertError } = await supabase
        .from('partnerships')
        .insert({
          user_id: user.id,
          partner_id: partnerId,
          status: 'pending',
        })

      if (insertError) throw insertError

      setInviteEmail('')
      setShowInviteModal(false)
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
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="text-zinc-400" size={20} />
          <h2 className="text-lg font-semibold text-white">Partners</h2>
          {partners.length > 0 && (
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
              {partners.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <UserPlus size={16} />
          Add Partner
        </button>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-4 space-y-2">
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
        <div className="text-center py-8 text-zinc-500">Loading partners...</div>
      ) : partners.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-zinc-800 rounded-xl">
          <Users className="mx-auto text-zinc-600 mb-2" size={32} />
          <p className="text-zinc-500 text-sm">No partners yet</p>
          <p className="text-zinc-600 text-xs mt-1">
            Invite friends to track habits together
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {partners.map((partner) => (
            <div
              key={partner.partnership.id}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => togglePartnerExpanded(partner.profile.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-white font-medium">
                    {partner.profile.display_name?.[0]?.toUpperCase() ||
                      partner.profile.email[0].toUpperCase()}
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-white">
                      {partner.profile.display_name || partner.profile.email.split('@')[0]}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {partner.habits.length} habits
                    </div>
                  </div>
                </div>
                {expandedPartners.has(partner.profile.id) ? (
                  <ChevronUp className="text-zinc-400" size={20} />
                ) : (
                  <ChevronDown className="text-zinc-400" size={20} />
                )}
              </button>

              {expandedPartners.has(partner.profile.id) && (
                <div className="border-t border-zinc-800 p-4 space-y-3">
                  {partner.habits.length === 0 ? (
                    <p className="text-zinc-500 text-sm text-center py-4">
                      No habits to show
                    </p>
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
            onClick={() => setShowInviteModal(false)}
          />
          <div className="relative bg-zinc-900 rounded-2xl p-6 w-full max-w-md mx-4 border border-zinc-800 shadow-2xl">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold text-white mb-2">Add Partner</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Enter your partner&apos;s email to send them an invitation
            </p>

            {inviteError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="partner@example.com"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg py-2.5 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  {inviteLoading ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </form>
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
  const supabase = createClient()

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', request.user_id)
        .single()

      if (data) setProfile(data as Profile)
    }
    fetchProfile()
  }, [request.user_id])

  if (!profile) return null

  return (
    <div className="bg-zinc-900/80 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-white font-medium">
          {profile.display_name?.[0]?.toUpperCase() || profile.email[0].toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-white">
            {profile.display_name || profile.email.split('@')[0]}
          </div>
          <div className="text-xs text-emerald-400">Wants to connect</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onReject}
          className="p-2 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
        <button
          onClick={onAccept}
          className="p-2 text-emerald-400 hover:text-emerald-300 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <Check size={18} />
        </button>
      </div>
    </div>
  )
}
