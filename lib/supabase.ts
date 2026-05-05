import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://rjyrurmqhgfrcvyrmohx.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqeXJ1cm1xaGdmcmN2eXJtb2h4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3ODU3NTksImV4cCI6MjA5MzM2MTc1OX0.Ks7SLy6enysbU2unq3SzjHclZpWd_JpptGNSCJIiDqA";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);