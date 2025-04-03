import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://aieddnesggepxxlppcgt.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZWRkbmVzZ2dlcHh4bHBwY2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM1ODA0NzMsImV4cCI6MjA1OTE1NjQ3M30.yidl8b8oDD35KQPigCg2jowANUXQ_3D9Hlx2kS5B3Ns';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
