import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// ---------------------------------------------------------------
// STEP 1: Go to supabase.com → your project → Settings → API
// STEP 2: Copy "Project URL" and "anon public" key and paste below
// ---------------------------------------------------------------
const SUPABASE_URL = 'https://fuegzfgmnlrahnkvccli.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZWd6ZmdtbmxyYWhua3ZjY2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNDE1NzAsImV4cCI6MjA5MTkxNzU3MH0.fDfGYTjB9K9L-WJ2F3i6CgyaXzuNMttsU9Aa-UDau5c'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
