import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Stripe from 'stripe';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';

  // Initialize Firebase client for backend synchronization safely
  let db: any = null;
  let auth: any = null;

  async function bootstrapAdmin(database: any, firebaseAuth: any) {
    const adminEmail = 'bradens@lonestarfenceworks.com';
    const adminPassword = 'password123';
    try {
      // 1. Ensure the admin document exists in Firestore under "admins"
      const adminDocRef = doc(database, 'admins', 'braden-lonestar-uid');
      const docSnap = await getDoc(adminDocRef);
      if (!docSnap.exists()) {
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        await setDoc(adminDocRef, {
          uid: 'braden-lonestar-uid',
          email: adminEmail,
          passwordHash: passwordHash,
          createdAt: new Date().toISOString(),
          canAccessAllData: true,
          isAdmin: true
        });
        console.log("Admin Firestore document registered successfully.");
      }

      // 2. Ensure they are signed in or registered in Firebase client Auth so server requests are authenticated
      try {
        await signInWithEmailAndPassword(firebaseAuth, adminEmail, adminPassword);
        console.log("Firebase server authenticated as admin successfully.");
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-email') {
          try {
            await createUserWithEmailAndPassword(firebaseAuth, adminEmail, adminPassword);
            console.log("Admin user registered in Firebase Auth successfully.");
            await signInWithEmailAndPassword(firebaseAuth, adminEmail, adminPassword);
          } catch (createErr) {
            console.error("Failed to create admin in Firebase Auth:", createErr);
          }
        } else {
          console.error("Firebase Auth admin login failed:", authErr);
        }
      }
    } catch (err) {
      console.error("Error during admin bootstrapping:", err);
    }
  }

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const firebaseApp = initializeApp(firebaseConfig);
      db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
      auth = getAuth(firebaseApp);
      console.log("Firebase Firestore backend connection initialized successfully.");
      
      // Bootstrap the admin
      await bootstrapAdmin(db, auth);
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

  // Helper to extract clerk user ID from Bearer token
  function getUserIdFromClerk(req: any): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.decode(token);
      if (decoded && typeof decoded === 'object' && decoded.sub) {
        return decoded.sub;
      }
    } catch (err) {
      console.error('Failed to decode Clerk token:', err);
    }
    return null;
  }

  // Helper to authenticate Admin JWT
  function authenticateAdmin(req: any, res: any, next: any) {
    const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Admin authentication is required. Token is missing.' });
    }
    const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;
    try {
      const decoded = jwt.verify(token as string, JWT_SECRET);
      if (decoded && typeof decoded === 'object' && (decoded as any).isAdmin) {
        req.admin = decoded;
        return next();
      }
    } catch (err) {
      console.warn('Invalid admin token:', err);
    }
    return res.status(403).json({ error: 'Access denied. Invalid or expired admin token.' });
  }

  // API Routes:
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // POST /api/admin/token-for-clerk - Elevate verified Clerk email to Admin JWT token
  app.post('/api/admin/token-for-clerk', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }
      const lowerEmail = email.toLowerCase();
      if (lowerEmail !== 'bradens@lonestarfenceworks.com' && lowerEmail !== 'usmc6123@gmail.com') {
        return res.status(403).json({ error: 'Access denied. Unauthorized admin email.' });
      }

      if (!db) {
        return res.status(503).json({ error: 'Database service is temporarily unavailable.' });
      }

      const adminDocRef = doc(db, 'admins', 'braden-lonestar-uid');
      let adminData: any = { email: lowerEmail };
      try {
        const docSnap = await getDoc(adminDocRef);
        if (docSnap.exists()) {
          adminData = docSnap.data();
        }
      } catch (err) {
        console.warn("Bootstrap admin check failed or skipped, using fallback");
      }

      const token = jwt.sign(
        { email: lowerEmail, isAdmin: true, uid: 'braden-lonestar-uid' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        admin: {
          email: lowerEmail,
          uid: 'braden-lonestar-uid',
          canAccessAllData: true,
          isAdmin: true
        }
      });
    } catch (error: any) {
      console.error('Error in clerk elevation:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // POST /api/admin/login - Admin email/password login
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      if (email.toLowerCase() !== 'bradens@lonestarfenceworks.com') {
        return res.status(403).json({ error: 'Access denied. Unauthorized admin email.' });
      }

      if (!db) {
        return res.status(503).json({ error: 'Database service is temporarily unavailable.' });
      }

      const adminDocRef = doc(db, 'admins', 'braden-lonestar-uid');
      const docSnap = await getDoc(adminDocRef);
      if (!docSnap.exists()) {
        return res.status(404).json({ error: 'Admin record not found in database.' });
      }

      const adminData = docSnap.data();
      const isMatch = await bcrypt.compare(password, adminData.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
      }

      // Create JWT
      const token = jwt.sign(
        { email: adminData.email, isAdmin: true, uid: 'braden-lonestar-uid' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        admin: {
          email: adminData.email,
          uid: 'braden-lonestar-uid',
          canAccessAllData: adminData.canAccessAllData || true,
          isAdmin: true
        }
      });
    } catch (error: any) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // GET /api/admin/users - Get all users (admin only)
  app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: 'Database offline' });

      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      const usersList: any[] = [];

      for (const d of snap.docs) {
        const u = d.data();
        // Count user's estimates
        const estRef = collection(db, 'users', d.id, 'estimates');
        const estSnap = await getDocs(estRef);
        usersList.push({
          uid: d.id,
          email: u.email || '',
          name: u.name || u.displayName || u.email?.split('@')[0] || 'No Name',
          subscriptionTier: u.tier || u.subscriptionTier || 'free',
          createdAt: u.createdAt || '',
          isDisabled: u.isDisabled || false,
          estimatesCount: estSnap.size
        });
      }

      res.json(usersList);
    } catch (error: any) {
      console.error('Error listing all users:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // POST /api/admin/users/create - Create a user manually (admin only)
  app.post('/api/admin/users/create', authenticateAdmin, async (req, res) => {
    try {
      const { email, name, subscriptionTier } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: 'Email and Name are required.' });
      }

      if (!db) return res.status(503).json({ error: 'Database offline' });

      // Check if user already exists
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return res.status(400).json({ error: 'User with this email already exists.' });
      }

      const newUserId = 'manual_' + Math.random().toString(36).substr(2, 9);
      const userRef = doc(db, 'users', newUserId);
      const userData = {
        email: email.trim().toLowerCase(),
        name: name.trim(),
        displayName: name.trim(),
        tier: subscriptionTier || 'free',
        isDisabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(userRef, userData);

      res.status(201).json({
        success: true,
        user: {
          uid: newUserId,
          email: userData.email,
          name: userData.name,
          subscriptionTier: userData.tier,
          createdAt: userData.createdAt,
          isDisabled: userData.isDisabled,
          estimatesCount: 0
        }
      });
    } catch (error: any) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // GET /api/admin/users/:userId - Get specific user details
  app.get('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      if (!db) return res.status(503).json({ error: 'Database offline' });

      const uRef = doc(db, 'users', userId);
      const snap = await getDoc(uRef);
      if (!snap.exists()) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ uid: snap.id, ...snap.data() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/users/:userId/estimates - Get all user's estimates
  app.get('/api/admin/users/:userId/estimates', authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      if (!db) return res.status(503).json({ error: 'Database offline' });

      const estRef = collection(db, 'users', userId, 'estimates');
      const snap = await getDocs(estRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/users/:userId/tier - Change user's subscription
  app.post('/api/admin/users/:userId/tier', authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { tier } = req.body;
      if (!tier || !['free', 'paid'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid subscription tier' });
      }

      if (!db) return res.status(503).json({ error: 'Database offline' });

      const uRef = doc(db, 'users', userId);
      await updateDoc(uRef, { tier: tier, subscriptionTier: tier, updatedAt: new Date().toISOString() });
      res.json({ success: true, tier });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/users/:userId/disable - Disable user
  app.post('/api/admin/users/:userId/disable', authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      if (!db) return res.status(503).json({ error: 'Database offline' });

      const uRef = doc(db, 'users', userId);
      await updateDoc(uRef, { isDisabled: true, updatedAt: new Date().toISOString() });
      res.json({ success: true, isDisabled: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/users/:userId/enable - Enable user
  app.post('/api/admin/users/:userId/enable', authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      if (!db) return res.status(503).json({ error: 'Database offline' });

      const uRef = doc(db, 'users', userId);
      await updateDoc(uRef, { isDisabled: false, updatedAt: new Date().toISOString() });
      res.json({ success: true, isDisabled: false });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/admin/users/:userId - Delete user
  app.delete('/api/admin/users/:userId', authenticateAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      if (!db) return res.status(503).json({ error: 'Database offline' });

      // Clean up subcollection estimates
      const estRef = collection(db, 'users', userId, 'estimates');
      const estSnap = await getDocs(estRef);
      for (const d of estSnap.docs) {
        await deleteDoc(doc(db, 'users', userId, 'estimates', d.id));
      }

      // Delete user doc
      const uRef = doc(db, 'users', userId);
      await deleteDoc(uRef);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/change-password - Change admin password
  app.post('/api/admin/change-password', authenticateAdmin, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required.' });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'New password and confirmation do not match.' });
      }

      if (!db) return res.status(503).json({ error: 'Database offline' });

      const adminRef = doc(db, 'admins', 'braden-lonestar-uid');
      const snap = await getDoc(adminRef);
      if (!snap.exists()) {
        return res.status(404).json({ error: 'Admin record not found.' });
      }

      const adminData = snap.data();
      const isMatch = await bcrypt.compare(currentPassword, adminData.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Incorrect current password.' });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await updateDoc(adminRef, { passwordHash: newHash, updatedAt: new Date().toISOString() });

      res.json({ success: true, message: 'Password changed successfully.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/logout - Admin logout
  app.post('/api/admin/logout', (req, res) => {
    res.json({ success: true });
  });

  // GET /api/user/profile - Get own profile
  app.get('/api/user/profile', async (req, res) => {
    try {
      const userId = getUserIdFromClerk(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Sign in via Clerk is required.' });
      }

      if (!db) return res.status(503).json({ error: 'Database offline' });

      const uRef = doc(db, 'users', userId);
      const snap = await getDoc(uRef);
      if (!snap.exists()) {
        return res.json({ uid: userId, tier: 'free', isDisabled: false });
      }
      res.json({ uid: snap.id, ...snap.data() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/user/estimates - Get own estimates
  app.get('/api/user/estimates', async (req, res) => {
    try {
      const userId = getUserIdFromClerk(req);
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }

      if (!db) return res.status(503).json({ error: 'Database offline' });

      const estRef = collection(db, 'users', userId, 'estimates');
      const snap = await getDocs(estRef);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.json(list);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
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
