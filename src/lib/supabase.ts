import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  "https://oygrthqnxgfjcennlrgl.supabase.co";

const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im95Z3J0aHFueGdmamNlbm5scmdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjU3ODcsImV4cCI6MjA5NzIwMTc4N30.Ta4tEtsoL0dJXwL7AavGqKcYestFKaSvqzr9-WjhOUI";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);