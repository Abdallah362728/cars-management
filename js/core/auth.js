// Authentication. The database is behind per-user RLS
// (supabase/migrations/002_enable_rls.sql), so every query needs a signed-in
// session and returns only that account's own cars — the anon key on its own
// reads nothing.
//
// supabase-js persists the session in localStorage and refreshes the access
// token on its own, so a signed-in device stays signed in across reloads.

import { supabase } from '../data/supabase-client.js'

export async function getSession() {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session ?? null
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.session
}

// Returns the new session, or null when the project has email confirmation
// switched on — Supabase creates the account but withholds the session until
// the address is confirmed, and the caller has to say so rather than pretending
// the sign-up failed.
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data.session ?? null
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Fires on sign-in, sign-out, and when a token refresh finally fails (expired
// or revoked session) — that last one is why the app can't just check once at
// boot and assume the session lasts forever.
export function onAuthChange(handler) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    handler(event, session)
  })
  return () => data.subscription.unsubscribe()
}
