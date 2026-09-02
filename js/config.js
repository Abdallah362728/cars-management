// Single configuration point for the app.
// The anon key below is meant to be public: every table is behind per-user
// row-level security (supabase/migrations/002_enable_rls.sql), so the key alone
// reads and writes nothing — each signed-in account sees only its own cars.
export const SUPABASE_URL = 'https://fuegzfgmnlrahnkvccli.supabase.co'
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1ZWd6ZmdtbmxyYWhua3ZjY2xpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNDE1NzAsImV4cCI6MjA5MTkxNzU3MH0.fDfGYTjB9K9L-WJ2F3i6CgyaXzuNMttsU9Aa-UDau5c'
