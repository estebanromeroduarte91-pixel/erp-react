import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nfcdqdbhrsjhbnbtqewl.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY2RxZGJocnNqaGJuYnRxZXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjU0NDksImV4cCI6MjA5NTQwMTQ0OX0.crMaV1oIodW1fTa2oTmYr2rk8hVLJbQPqUFHe6oFAV8'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function run() {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*')
    .limit(5)
  
  if (error) {
    console.error('Error fetching cotizaciones:', error)
  } else {
    console.log('Results from cotizaciones table:')
    console.log(JSON.stringify(data, null, 2))
  }
}

run()
