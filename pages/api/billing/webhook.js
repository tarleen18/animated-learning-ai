import Stripe from 'stripe';
import prisma from '../../../lib/prisma';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing Stripe signature');

  const body = await buffer(req);
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const credits = Number(session.metadata?.credits || 0);
    if (userId && credits > 0) {
      try {
        await prisma.user.update({ where: { id: userId }, data: { credits: { increment: credits } } });
        await prisma.billingEvent.create({ data: { userId, type: 'stripe_checkout', amountCents: session.amount_total || 0, credits, currency: session.currency || 'usd', stripeSessionId: session.id, metadata: JSON.stringify({ session }) } });
      } catch (err) {
        console.error('Failed to record Stripe checkout event:', err);
        return res.status(500).send('Failed to process billing event');
      }
    }
  }

  res.status(200).json({ received: true });
}
