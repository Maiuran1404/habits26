import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Chainable mock that returns itself for any method call
const createChainableMock = (finalValue: any = { data: [], error: null }) => {
  const handler: ProxyHandler<any> = {
    get: (target, prop) => {
      // Terminal methods that return promises
      if (prop === 'single') return async () => ({ data: null, error: null })
      // Make the mock properly thenable so await works
      if (prop === 'then') {
        return (resolve: (value: any) => void) => {
          // Resolve immediately with the final value
          resolve(finalValue)
          return Promise.resolve(finalValue)
        }
      }
      // Data access
      if (prop === 'data') return finalValue.data
      if (prop === 'error') return finalValue.error
      // Chainable methods return proxy
      return (...args: any[]) => new Proxy({}, handler)
    },
    apply: () => new Proxy({}, handler),
  }
  return new Proxy({}, handler)
}

// Singleton instance for browser-side client
let browserClient: ReturnType<typeof createBrowserClient> | null = null

// Mock client for when env vars are missing
const mockClient = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signUp: async () => ({ data: null, error: new Error('Supabase not configured') }),
    signInWithPassword: async () => ({ data: null, error: new Error('Supabase not configured') }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: () => createChainableMock(),
  rpc: async () => ({ data: null, error: null }),
} as any

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a mock client that does nothing during build/SSR without env vars
    return mockClient
  }

  // Return existing instance if available (singleton pattern)
  if (browserClient) {
    return browserClient
  }

  // Create and cache the client
  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return browserClient
}
