// Supabase client for the browser.
// Only the project URL and the PUBLIC "publishable" key live here — both are
// safe to ship in client-side code. Data access is protected by the Row Level
// Security policies defined in supabase-schema.sql, not by keeping this key
// secret. The database password / connection strings must NEVER appear here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = createClient(
  'https://ainkugpuqvclzgvuqmgo.supabase.co',
  'sb_publishable_Zc2-D7tVd33sC61ueUKjlQ_Ecxn4TyP'
);
