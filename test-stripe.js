// Quick Stripe test
require('dotenv').config({ path: '.env.local' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testStripe() {
  console.log('🔍 Testing Stripe configuration...\n');

  console.log('Key exists:', !!process.env.STRIPE_SECRET_KEY);
  console.log('Key length:', process.env.STRIPE_SECRET_KEY?.length);
  console.log('Key starts with:', process.env.STRIPE_SECRET_KEY?.substring(0, 10));
  console.log(
    'Key ends with:',
    process.env.STRIPE_SECRET_KEY?.substring(process.env.STRIPE_SECRET_KEY.length - 5)
  );

  // Check for invisible characters
  const keyBytes = Buffer.from(process.env.STRIPE_SECRET_KEY);
  const hasInvisibleChars = keyBytes.some((byte) => byte < 32 || byte > 126);
  console.log('Has invisible characters:', hasInvisibleChars);

  console.log('\n🎯 Attempting to create checkout session...\n');

  try {
    const priceId = process.env.STRIPE_PRICE_ID || 'price_1SIgAtF8aJ0BDqA3WXVJsuVD';

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      return_url: 'http://localhost:8080/create-account?session_id={CHECKOUT_SESSION_ID}',
      subscription_data: {
        trial_period_days: 7,
      },
      automatic_tax: {
        enabled: true,
      },
    });

    console.log('✅ SUCCESS! Checkout session created:', session.id);
    console.log('✅ Checkout URL:', session.url);
    console.log('\n🎉 Your Stripe configuration is WORKING!');
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    console.error('Error type:', error.type);
    console.error('Error code:', error.code);

    if (error.code === 'ERR_INVALID_CHAR') {
      console.error('\n⚠️ Your Stripe key has INVALID CHARACTERS (spaces/newlines)');
      console.error(
        '⚠️ Copy the key again from Stripe dashboard - be careful not to add extra whitespace'
      );
    }
  }
}

testStripe();
