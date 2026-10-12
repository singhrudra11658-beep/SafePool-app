import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Yahan apni Dashboard wali actual values daalna
const SUPABASE_URL = "https://xarytixvslqlhhtdfdba.supabase.co"; // e.g. https://<project-id>.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhcnl0aXh2c2xxbGhodGRmZGJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1Mjg1NTEsImV4cCI6MjEwNjEwNDU1MX0.Jc05wr8NXn-i5gl6hUF09-jdPwbPFHWbY_VBy4KW_9k";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});