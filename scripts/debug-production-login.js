#!/usr/bin/env node
/**
 * Debug Production Login Issue
 *
 * This script simulates the exact login flow from the production Vercel app
 * and captures the complete error response from Supabase.
 */

const https = require('https');

// Production credentials from DEPLOY.md
const SUPABASE_URL = 'https://pqkdcfxkitovcgvjoyuu.supabase.co';
const ANON_KEY = 'sb_publishable_1OLaFwC1fEhzlEoPgRjTNg_qeqpxhJJ';
const TEST_EMAIL = 'test@example.com';

// Construct the OTP request exactly as the client does
const postData = JSON.stringify({
  email: TEST_EMAIL,
  create_user: true,
  gotrue_meta_security: {},
  code_challenge: null,
  code_challenge_method: null
});

const options = {
  hostname: 'pqkdcfxkitovcgvjoyuu.supabase.co',
  port: 443,
  path: '/auth/v1/otp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'apikey': ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
    'X-Client-Info': 'supabase-js-web/2.45.0',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  }
};

console.log('🔍 DEBUGGING PRODUCTION LOGIN');
console.log('=' .repeat(80));
console.log('');
console.log('📍 Target:', `${SUPABASE_URL}/auth/v1/otp`);
console.log('📧 Email:', TEST_EMAIL);
console.log('🔑 Anon Key:', ANON_KEY.substring(0, 30) + '...');
console.log('');
console.log('📡 REQUEST DETAILS:');
console.log(JSON.stringify(options, null, 2));
console.log('');
console.log('📦 REQUEST BODY:');
console.log(postData);
console.log('');
console.log('⏳ Sending request...');
console.log('');

const req = https.request(options, (res) => {
  console.log('=' .repeat(80));
  console.log('📨 RESPONSE RECEIVED');
  console.log('=' .repeat(80));
  console.log('');
  console.log('📊 STATUS:', res.statusCode, res.statusMessage);
  console.log('');
  console.log('📋 RESPONSE HEADERS:');
  console.log(JSON.stringify(res.headers, null, 2));
  console.log('');

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📦 RESPONSE BODY:');
    console.log('─'.repeat(80));

    try {
      const jsonData = JSON.parse(data);
      console.log(JSON.stringify(jsonData, null, 2));

      console.log('');
      console.log('=' .repeat(80));
      console.log('🔍 ANALYSIS');
      console.log('=' .repeat(80));
      console.log('');

      if (res.statusCode === 401) {
        console.log('🚨 401 UNAUTHORIZED ERROR DETECTED');
        console.log('');
        console.log('📝 Error Message:', jsonData.msg || jsonData.message || jsonData.error);
        console.log('📝 Error Code:', jsonData.code || jsonData.error_code || 'N/A');
        console.log('');
        console.log('🔍 LIKELY CAUSES:');

        const msg = (jsonData.msg || jsonData.message || jsonData.error || '').toLowerCase();

        if (msg.includes('api key')) {
          console.log('  ❌ Invalid API key');
          console.log('  → Check Vercel env vars: NEXT_PUBLIC_SUPABASE_ANON_KEY');
          console.log('  → Verify key format starts with "sb_publishable_"');
        } else if (msg.includes('email') && msg.includes('disable')) {
          console.log('  ❌ Email signups are disabled');
          console.log('  → Go to Supabase Dashboard → Authentication → Providers');
          console.log('  → Enable "Email" provider');
        } else if (msg.includes('redirect')) {
          console.log('  ❌ Invalid redirect URL');
          console.log('  → Go to Supabase Dashboard → Authentication → URL Configuration');
          console.log('  → Add production URL to allowed redirect URLs');
        } else if (msg.includes('rate')) {
          console.log('  ❌ Rate limiting');
          console.log('  → Wait a few minutes and try again');
        } else if (msg.includes('confirm')) {
          console.log('  ❌ Email confirmations required but SMTP not configured');
          console.log('  → Go to Supabase Dashboard → Authentication → Email Templates');
          console.log('  → Configure SMTP or disable email confirmations for testing');
        } else {
          console.log('  ⚠️  Unknown error - see full response above');
        }
      } else if (res.statusCode === 200) {
        console.log('✅ REQUEST SUCCESSFUL');
        console.log('');
        console.log('Magic link should be sent to:', TEST_EMAIL);
      } else {
        console.log('⚠️  UNEXPECTED STATUS CODE:', res.statusCode);
      }

    } catch (e) {
      console.log('⚠️  Non-JSON response:');
      console.log(data);
      console.log('');
      console.log('Parse error:', e.message);
    }

    console.log('');
    console.log('=' .repeat(80));
    console.log('✅ DEBUG COMPLETE');
    console.log('=' .repeat(80));
  });
});

req.on('error', (error) => {
  console.error('❌ REQUEST FAILED:', error.message);
  console.error('');
  console.error('Full error:', error);
});

req.write(postData);
req.end();
