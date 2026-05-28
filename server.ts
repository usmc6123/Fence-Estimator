import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Stripe from 'stripe';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase client for backend synchronization safely
  let db: any = null;
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const firebaseApp = initializeApp(firebaseConfig);
      db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
      console.log("Firebase Firestore backend connection initialized successfully.");
    } else {
      console.warn("firebase-applet-config.json not found. Database operations will be disabled.");
    }
  } catch (error) {
    console.error("Failed to initialize Firebase app safely:", error);
  }

  // Lazy initialize Stripe
  let stripeClient: Stripe | null = null;
  function getStripe() {
    if (!stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        console.warn("STRIPE_SECRET_KEY is missing. Stripe actions will fail.");
      }
      stripeClient = new Stripe(key || 'mock-key');
    }
    return stripeClient;
  }

  app.use(cors());

  // JSON parsing except for Stripe Webhooks which need raw body
  app.use((req, res, next) => {
    if (req.originalUrl === '/api/webhooks/stripe') {
      next();
    } else {
      express.json()(req, res, next);
    }
  });

  // API Routes:
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // GET User Tier
  app.get('/api/user-tier', async (req, res) => {
    try {
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'userId parameter is required' });
      }

      if (!db) {
        console.warn("Database is not configured. Defaulting to free tier.");
        return res.json({ tier: 'free', nextBillingDate: null });
      }

      const uRef = doc(db, 'users', userId);
      const docSnap = await getDoc(uRef);
      if (docSnap.exists()) {
        res.json({ tier: docSnap.data().tier || 'free', nextBillingDate: docSnap.data().nextBillingDate || null });
      } else {
        res.json({ tier: 'free', nextBillingDate: null });
      }
    } catch (error: any) {
      console.error('Error fetching user tier:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // Create Stripe Checkout Session
  app.post('/api/checkout', async (req, res) => {
    try {
      const { userId, email } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        return res.status(400).json({
          error: 'Stripe is not fully configured (missing STRIPE_SECRET_KEY). Please add your API keys in the Settings menu.',
        });
      }

      const stripeInstance = getStripe();
      const origin = req.headers.origin || 'http://localhost:3000';
      
      const session = await stripeInstance.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Fence Estimator Paid Tier Subscription',
                description: 'Full monthly access to the premium estimation suite and contract generators.',
              },
              unit_amount: 5000, // $50.00
              recurring: {
                interval: 'month',
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${origin}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}?canceled=true`,
        customer_email: email || undefined,
        metadata: {
          userId: userId,
        },
      });

      res.json({ id: session.id, url: session.url });
    } catch (error: any) {
      console.error('Error creating Stripe checkout session:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // Verify Stripe Session (Backup Redirect Sync)
  app.post('/api/verify-session', async (req, res) => {
    try {
      const { sessionId, userId } = req.body;
      if (!sessionId || !userId) {
        return res.status(400).json({ error: 'sessionId and userId are required' });
      }

      if (!db) {
        return res.status(503).json({ error: 'Database service is temporarily unavailable. Unable to verify session.' });
      }

      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        return res.status(400).json({ error: 'Stripe is not configured.' });
      }

      const stripeInstance = getStripe();
      const session = await stripeInstance.checkout.sessions.retrieve(sessionId);
      
      if (session.payment_status === 'paid' || session.status === 'complete') {
        const uRef = doc(db, 'users', userId);
        const docSnap = await getDoc(uRef);
        const expirationDate = new Date();
        expirationDate.setMonth(expirationDate.getMonth() + 1);

        const updateData = {
          tier: 'paid',
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
          nextBillingDate: expirationDate.toISOString(),
          updatedAt: new Date().toISOString()
        };

        if (docSnap.exists()) {
          await updateDoc(uRef, updateData);
        } else {
          await setDoc(uRef, {
            uid: userId,
            email: session.customer_details?.email || '',
            createdAt: new Date().toISOString(),
            ...updateData
          });
        }

        return res.json({ success: true, tier: 'paid', nextBillingDate: expirationDate.toISOString() });
      } else {
        return res.status(400).json({ error: 'Session is not paid or completed.' });
      }
    } catch (error: any) {
      console.error('Error verifying Stripe session:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // Cancel Stripe Subscription
  app.post('/api/cancel-subscription', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      if (!db) {
        return res.status(503).json({ error: 'Database service is temporarly unavailable.' });
      }

      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        return res.status(400).json({ error: 'Stripe is not configured.' });
      }

      const uRef = doc(db, 'users', userId);
      const docSnap = await getDoc(uRef);
      if (!docSnap.exists()) {
        return res.status(404).json({ error: 'User does not exist in database.' });
      }

      const userData = docSnap.data();
      const subId = userData.stripeSubscriptionId;

      if (!subId) {
        return res.status(400).json({ error: 'No active Stripe subscription found for this user.' });
      }

      const stripeInstance = getStripe();
      // Cancel at period end
      await stripeInstance.subscriptions.update(subId, {
        cancel_at_period_end: true,
      });

      // Update DB status to free
      await updateDoc(uRef, {
        tier: 'free',
        stripeSubscriptionId: null,
        nextBillingDate: null,
        updatedAt: new Date().toISOString()
      });

      res.json({ success: true, message: 'Subscription cancelled successfully' });
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // Stripe Webhooks Route (Raw Parser)
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!db) {
      console.warn("Webhook received but database is not configured.");
      return res.status(503).send("Database offline");
    }

    const stripeInstance = getStripe();
    let event;

    try {
      if (endpointSecret && sig) {
        event = stripeInstance.webhooks.constructEvent(req.body, sig, endpointSecret);
      } else {
        // Fallback for local/dev without signature
        event = JSON.parse(req.body.toString());
      }
    } catch (err: any) {
      console.warn(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (userId) {
          const uRef = doc(db, 'users', userId);
          const expirationDate = new Date();
          expirationDate.setMonth(expirationDate.getMonth() + 1);

          await setDoc(uRef, {
            tier: 'paid',
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
            stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
            nextBillingDate: expirationDate.toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });
          console.log(`Subscription successfully active for user: ${userId}`);
        }
      } else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (userId) {
          const uRef = doc(db, 'users', userId);
          await updateDoc(uRef, {
            tier: 'free',
            stripeSubscriptionId: null,
            nextBillingDate: null,
            updatedAt: new Date().toISOString()
          });
          console.log(`Subscription successfully canceled for user: ${userId}`);
        }
      }

      res.json({ received: true });
    } catch (dbErr: any) {
      console.error('Firestore webhook update failed:', dbErr);
      res.status(500).send('Webhook db error');
    }
  });

  // Integrate Vite Server Middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
