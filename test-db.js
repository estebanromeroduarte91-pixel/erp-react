import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nfcdqdbhrsjhbnbtqewl.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY2RxZGJocnNqaGJuYnRxZXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjU0NDksImV4cCI6MjA5NTQwMTQ0OX0.crMaV1oIodW1fTa2oTmYr2rk8hVLJbQPqUFHe6oFAV8'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function run() {
  const { data, error } = await supabase
    .from('ordenes')
    .insert({
      id: 'test-insert-123',
      empresa_id: 'f347f086-d2ba-40b0-ab70-95a7c02c8781',
      num: '9999',
      fecha: new Date().toISOString(),
      nombre: 'Test',
      is_draft: false
    })
    .select()
  
  if (error) {
    console.error('Error inserting:', error)
  } else {
    console.log('Successfully inserted:', data)
  }
}

run()
