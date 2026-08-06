// Shared Supabase client for the active project.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const SUPABASE_PROJECT_URL = 'https://slctyweshylsfecqqcsy.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsY3R5d2VzaHlsc2ZlY3FxY3N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NjQzMDAsImV4cCI6MjEwMTM0MDMwMH0._XKZPj-ta65Sye775HY4zGnAAHCipMOqTPZlMluV_jA';

if (typeof window !== 'undefined') {
  console.log('ACTIVE SUPABASE PROJECT URL', SUPABASE_PROJECT_URL);
}

export const supabase = createClient<Database>(SUPABASE_PROJECT_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Same client, loosely typed — the generated Database types lag behind the
// external project's travel_plans columns (plan_result, error_message).
export const db: SupabaseClient = supabase as unknown as SupabaseClient;
