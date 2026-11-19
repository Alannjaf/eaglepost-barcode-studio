// Desktop build: all data is stored locally on this PC (IndexedDB) instead of the online
// Supabase project. `localdb` implements the subset of the supabase-js API this app uses,
// so the rest of the code keeps calling `supabase.from(...)` unchanged.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { localdb } from "@/integrations/local/localdb";

export const supabase = localdb as unknown as SupabaseClient<Database>;
