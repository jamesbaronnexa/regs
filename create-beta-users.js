import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load from .env.local specifically
dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Add your beta testers here
const betaTesters = [
  { 
    email: 'james@barons.co.nz', 
    name: 'James',
    trade: 'electrical',
    access: ['electrical'] 
  },
  // Add more...
]

async function createBetaUsers() {
  console.log('🚀 Creating beta users...\n')
  
  for (const tester of betaTesters) {
    console.log(`--- ${tester.name} (${tester.email}) ---`)
    
    try {
      // Generate magic link and create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: tester.email,
        options: {
          redirectTo: 'https://regs-beta.vercel.app/search'
        }
      })
      
      if (authError) throw authError
      
      console.log('✅ Auth user created')
      
      // Create user profile with document access
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          email: tester.email,
          trade_type: tester.trade,
          document_access: tester.access,
          beta_terms_accepted: true,
          beta_terms_accepted_at: new Date().toISOString()
        })
      
      if (profileError) throw profileError
      
      console.log('✅ Profile created')
      console.log(`🔑 Access: ${tester.access.join(', ')}`)
      console.log('📧 MAGIC LINK:')
      console.log(authData.properties.action_link)
      console.log('')
      
    } catch (error) {
      console.error('❌ Error:', error.message)
      console.log('')
    }
  }
  
  console.log('✅ All done! Copy those magic links for your emails.')
}

createBetaUsers()