import { supabase } from '@/lib/supabaseClient';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { user_id, name, niche } = await req.json();

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id, name, niche });

  if (error) {
    return NextResponse.json({ error: 'Failed to save profile info' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Profile saved' });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const user_id = searchParams.get('user_id');

  const { data, error } = await supabase
    .from('profiles')
    .select('name, niche')
    .eq('user_id', user_id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
