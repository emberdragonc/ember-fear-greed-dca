#!/bin/bash
# Deploy DCA Executor to Supabase
# Usage: ./supabase/DEPLOY.sh

set -e

echo "========================================="
echo "  DCA Executor Deployment Script"
echo "========================================="
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
fi

# Check if logged in
echo "1. Checking Supabase login..."
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in. Run: supabase login"
    exit 1
fi
echo "✅ Logged in"

# Check if linked to project
echo ""
echo "2. Linking to project..."
PROJECT_REF="coulnwjergkqsjmdsioz"
supabase link --project-ref $PROJECT_REF || echo "Already linked"
echo "✅ Linked to project"

# Deploy Edge Function
echo ""
echo "3. Deploying Edge Function..."
supabase functions deploy dca-executor --no-verify-jwt
echo "✅ Edge Function deployed"

# Instructions for environment variables
echo ""
echo "========================================="
echo "  Next Steps"
echo "========================================="
echo ""
echo "1. Set environment variables in Supabase dashboard:"
echo "   https://supabase.com/dashboard/project/$PROJECT_REF/settings/functions"
echo ""
echo "   Required secrets:"
echo "   - BACKEND_PRIVATE_KEY"
echo "   - PIMLICO_API_KEY"
echo "   - UNISWAP_API_KEY"
echo "   - ALCHEMY_API_KEY"
echo ""
echo "2. Apply the pg_cron migration:"
echo "   supabase db push"
echo ""
echo "3. Set the Edge Function URL:"
echo "   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://$PROJECT_REF.supabase.co';"
echo "   ALTER DATABASE postgres SET app.settings.supabase_anon_key = '<your_anon_key>';"
echo ""
echo "4. Test manually:"
echo "   curl -X POST 'https://$PROJECT_REF.supabase.co/functions/v1/dca-executor' \\"
echo "     -H \"Authorization: Bearer <anon_key>\" \\"
echo "     -H \"Content-Type: application/json\""
echo ""
echo "5. Verify cron schedule:"
echo "   SELECT * FROM cron.job WHERE jobname LIKE '%dca%';"
echo ""
echo "========================================="
echo "Deployment complete! 🎉"
echo "========================================="
