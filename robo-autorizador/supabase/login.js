const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://wmugemamnqxjfpxrlwes.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdWdlbWFtbnF4amZweHJsd2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTgwNDcsImV4cCI6MjA5MTY3NDA0N30.c06BZ-1bxpBVLjyumgHyqXawror_J-jTsdOKqWDl1G0'
)

async function login() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'teste@teste.com',
    password: '123456'
  })

  if (error) {
    console.log('Erro:', error.message)
    return
  }

  console.log('TOKEN COMPLETO:', data.session.access_token)
}

login()
