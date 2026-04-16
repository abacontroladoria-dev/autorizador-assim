require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

async function teste() {
  const { data, error } = await supabase
    .from('autorizacoes')
    .select('*')
    .limit(1)

  console.log('DATA:', data)
  console.log('ERROR:', error)
}

teste()