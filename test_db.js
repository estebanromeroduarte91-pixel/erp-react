import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Load environment variables from .env
const envText = fs.readFileSync('.env', 'utf-8')
const env = {}
envText.split('\n').forEach(line => {
  const parts = line.split('=')
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
  }
})

const supabaseUrl = env['VITE_SUPABASE_URL']
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY']

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env file.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
  console.log("Querying cotizaciones table...")
  const { data, error } = await supabase.from('cotizaciones').select('*').limit(1)
  
  if (error) {
    console.error("DB Error: ", error)
  } else {
    console.log("Success! Table exists. Data count retrieved: ", data.length)
  }
}

testConnection()
