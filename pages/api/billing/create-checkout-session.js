import Stripe from 'stripe';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const { quantity = 1 } = req.body || {};
  const packSize = 10;
  const credits = Math.max(1, Number(quantity)) * packSize;
  const amountCents = Math.max(1, Number(quantity)) * 1000; // $10 per 10 credits

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email || undefined, name: user.name || undefined });
    customerId = customer.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }

  const origin = req.headers.origin || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const checkoutSession = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Animated Learning Credits', description: `${credits} credits` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }
    ],
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/?checkout=canceled`,
    metadata: { userId: user.id, credits: String(credits) }
  });

  return res.status(200).json({ url: checkoutSession.url });
}
