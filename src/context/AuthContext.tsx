'use client'

import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/types/database'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  showAuthModal: boolean
  setShowAuthModal: (show: boolean) => void
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  const fetchProfile = async (userId: string) => {
    // Timeout for profile fetch - don't hang forever (2 seconds)
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error('Profile fetch timeout')), 2000)
    })

    try {
      const fetchPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      const { data } = await Promise.race([fetchPromise, timeoutPromise.then(() => ({ data: null }))]) as any

      if (data) {
        setProfile(data as Profile)
      }
    } catch (err) {
      console.warn('Profile fetch failed or timed out:', err)
      // Don't block loading - profile can be null
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  useEffect(() => {
    const getSession = async () => {
      // Overall timeout for auth initialization (3 seconds max)
      const timeout = setTimeout(() => {
        console.warn('Auth initialization timed out')
        setLoading(false)
      }, 3000)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          await fetchProfile(session.user.id)
        }
      } catch (err) {
        console.error('Error during auth initialization:', err)
      } finally {
        clearTimeout(timeout)
        setLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: AuthChangeEvent, session: Session | null) => {
        setSession(session)
        // Only update user if the user ID changed to avoid unnecessary re-renders
        setUser(prev => {
          const newUser = session?.user ?? null
          if (prev?.id === newUser?.id) return prev
          return newUser
        })

        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
        }

        if (event === 'SIGNED_IN') {
          setShowAuthModal(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    try {
      // Clear local state first for immediate UI feedback
      setUser(null)
      setProfile(null)
      setSession(null)

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut()

      if (error) {
        console.error('Error signing out:', error)
      }

      // Force reload to clear any cached state
      window.location.reload()
    } catch (err) {
      console.error('Error during sign out:', err)
      // Still reload even if there's an error
      window.location.reload()
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        showAuthModal,
        setShowAuthModal,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
