import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import Stripe from 'stripe';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

// Modular Admin APIs
import { listUsers, createUser, updateUser, deleteUser } from './api/admin/users';
import adminHandler from './api/admin';
import listEstimates from './api/estimates/list';
import listExpenses from './api/expenses/list';
import listQuotes from './api/quotes/list';
import listMaterials from './api/materials/list';
import writeExpense from './api/expenses/write';
import writeEstimate from './api/estimates/write';
import sendEstimate from './api/estimates/send';
import settingsHandler from './api/settings';

async function startServer() {
  const app = express();
  const PORT = 3000;
  const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';

  // Initialize Firebase client for backend synchronization safely
  let db: any = null;
  let auth: any = null;

  async function bootstrapAdmin(database: any, firebaseAuth: any) {
    const defaultAdmins = [
      { email: 'bradens@lonestarfenceworks.com' },
      { email: 'usmc6123@gmail.com' }
    ];
    const adminPassword = 'password123';
    
    for (const adm of defaultAdmins) {
      try {
        let currentUid = '';
        
        // 1. Authenticate first to establish standard user authenticated Firebase Client session on the backend
        try {
          const userCredential = await signInWithEmailAndPassword(firebaseAuth, adm.email, adminPassword);
          currentUid = userCredential.user.uid;
          console.log(`Firebase server authenticated as admin ${adm.email} successfully with UID: ${currentUid}`);
        } catch (authErr: any) {
          if (
            authErr.code === 'auth/user-not-found' || 
            authErr.code === 'auth/invalid-credential' || 
            authErr.code === 'auth/invalid-email' ||
            authErr.code === 'auth/wrong-password' ||
            authErr.code === 'auth/cannot-find-user'
          ) {
            try {
              const userCredential = await createUserWithEmailAndPassword(firebaseAuth, adm.email, adminPassword);
              currentUid = userCredential.user.uid;
              console.log(`Admin user registered in Firebase Auth ${adm.email} successfully with UID: ${currentUid}`);
              await signInWithEmailAndPassword(firebaseAuth, adm.email, adminPassword);
            } catch (createErr: any) {
              if (
                createErr.code === 'auth/email-already-in-use' || 
                (createErr.message && createErr.message.includes('auth/email-already-in-use')) ||
                (createErr.message && createErr.message.includes('email-already-in-use'))
              ) {
                console.log(`Admin user ${adm.email} already exists in Firebase Auth. Skipping creation.`);
                continue;
              }
              console.warn(`Failed to register admin ${adm.email} in Firebase Auth: ${createErr?.message || createErr}`);
              continue;
            }
          } else {
            console.warn(`Firebase Auth admin ${adm.email} login failed: ${authErr?.message || authErr}`);
            continue;
          }
        }

        // 2. Now that we are signed in, the Firestore client has full permissions to read/write this document
        const uidsToCreate = [currentUid];
        if (adm.email.toLowerCase().trim() === 'bradens@lonestarfenceworks.com') {
          uidsToCreate.push('braden-lonestar-uid');
        }

        for (const uid of uidsToCreate) {
          const adminDocRef = doc(database, 'admins', uid);
          const docSnap = await getDoc(adminDocRef);
          const passwordHash = await bcrypt.hash(adminPassword, 10);
          
          if (!docSnap.exists()) {
            await setDoc(adminDocRef, {
              uid: uid,
              email: adm.email,
              passwordHash: passwordHash,
              createdAt: new Date().toISOString(),
              canAccessAllData: true,
              isAdmin: true
            });
            console.log(`Admin Firestore document for ${adm.email} (${uid}) registered successfully.`);
          } else {
            await updateDoc(adminDocRef, {
              passwordHash: passwordHash,
              email: adm.email
            });
            console.log(`Admin Firestore password reset for ${adm.email} (${uid}) completed successfully.`);
          }
        }
      } catch (err) {
        console.error(`Error during admin bootstrapping for ${adm.email}:`, err);
      }
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
      if (decoded && typeof decoded === 'object') {
        return decoded.uid || decoded.sub || null;
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
      if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ error: 'Admin authentication is required. Token is invalid.' });
      }
      const decoded = jwt.verify(token as string, JWT_SECRET);
      if (decoded && typeof decoded === 'object' && (decoded as any).isAdmin) {
        req.admin = decoded;
        return next();
      }
    } catch (err) {
      // Suppress noisy JWT token error messages in standard output to keep integration logs clean
    }
    return res.status(403).json({ error: 'Access denied. Invalid or expired admin token.' });
  }

  // API Routes:
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // POST /api/admin/login - Admin email/password login
  app.post('/api/admin/login', (req, res) => {
    req.body.action = 'login';
    adminHandler(req, res);
  });

  // POST /api/user/login - Custom client login
  app.post('/api/user/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const emailLower = email.toLowerCase().trim();
      const pwd = password.trim();

      if (!db) {
        return res.status(503).json({ error: 'Database service offline' });
      }

      // Handle direct admin access via main app login
      if (emailLower === 'bradens@lonestarfenceworks.com' || emailLower === 'usmc6123@gmail.com') {
        const adminsSnap = await getDocs(collection(db, 'admins'));
        const adminDoc = adminsSnap.docs.find(d => d.data().email?.toLowerCase() === emailLower);

        if (!adminDoc) {
          return res.status(404).json({ error: 'Admin record not found in database.' });
        }

        const adminData = adminDoc.data();
        let adminUid = adminDoc.id;
        if (emailLower === 'bradens@lonestarfenceworks.com') {
          adminUid = 'braden-lonestar-uid';
        }

        // Verify password with bcryptjs
        const isMatch = await bcrypt.compare(pwd, adminData.passwordHash);
        if (!isMatch) {
          return res.status(401).json({ error: 'Access Denied: Incorrect email or password.' });
        }

        // Create JWT for persistence
        const token = jwt.sign(
          { email: adminData.email, isAdmin: true, uid: adminUid },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        return res.json({
          success: true,
          token,
          user: {
            uid: adminUid,
            email: adminData.email,
            name: emailLower === 'bradens@lonestarfenceworks.com' ? 'Braden' : 'Admin',
            displayName: emailLower === 'bradens@lonestarfenceworks.com' ? 'Braden' : 'Admin',
            tier: 'paid',
            subscriptionTier: 'paid',
            isAdmin: true
          }
        });
      }

      // Look up standard user in Firestore
      const snap = await getDocs(collection(db, 'users'));
      const userDoc = snap.docs.find(d => d.data().email?.toLowerCase() === emailLower);

      if (!userDoc) {
        return res.status(401).json({ error: 'Access Denied: Incorrect email or password.' });
      }

      const userData = userDoc.data();
      
      if (userData.isDisabled) {
        return res.status(403).json({ error: 'Access Denied: This account has been disabled.' });
      }

      if (!userData.passwordHash) {
        return res.status(401).json({ error: 'Access Denied: Account not configured with local password login.' });
      }

      const isMatch = await bcrypt.compare(pwd, userData.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Access Denied: Incorrect email or password.' });
      }

      res.json({
        success: true,
        user: {
          uid: userData.uid || userDoc.id,
          email: userData.email,
          name: userData.name || userData.displayName || 'Client',
          displayName: userData.displayName || userData.name || 'Client',
          tier: userData.tier || userData.subscriptionTier || 'free',
          subscriptionTier: userData.subscriptionTier || userData.tier || 'free'
        }
      });
    } catch (error: any) {
      console.error('Error in custom client login:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
  });

  // GET /api/admin/users - Get all users (admin only)
  app.get('/api/admin/users', listUsers);

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
  app.delete('/api/admin/users/:userId', authenticateAdmin, (req, res) => deleteUser(req, res, db));

  // POST /api/admin/users - Create new user (admin only)
  app.post('/api/admin/users', authenticateAdmin, (req, res) => createUser(req, res, db));

  // PUT /api/admin/users/:userId - Edit user details (admin only)
  app.put('/api/admin/users/:userId', authenticateAdmin, (req, res) => updateUser(req, res, db));

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

      const adminUid = (req as any).admin?.uid || 'braden-lonestar-uid';
      const adminEmail = (req as any).admin?.email;
      const adminRef = doc(db, 'admins', adminUid);
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

      // Find all matching admin documents to synchronize the password update
      const syncUids = [adminUid];
      if (adminEmail) {
        try {
          const adminsSnap = await getDocs(collection(db, 'admins'));
          adminsSnap.docs.forEach(d => {
            const dEmail = d.data().email?.toLowerCase()?.trim();
            if (dEmail === adminEmail.toLowerCase().trim() && !syncUids.includes(d.id)) {
              syncUids.push(d.id);
            }
          });
        } catch (syncErr) {
          console.error("Error finding duplicate admin docs to synchronize:", syncErr);
        }
      }

      for (const uid of syncUids) {
        try {
          const ref = doc(db, 'admins', uid);
          await updateDoc(ref, { passwordHash: newHash, updatedAt: new Date().toISOString() });
        } catch (updateErr) {
          console.error(`Error syncing password update for admin uid ${uid}:`, updateErr);
        }
      }

      res.json({ success: true, message: 'Password changed successfully.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/logout - Admin logout
  app.post('/api/admin/logout', (req, res) => {
    res.json({ success: true });
  });

  // POST /api/admin/verify-credentials - Verification and automatic 24-hour token refresh
  app.post('/api/admin/verify-credentials', (req, res) => {
    req.body.action = 'verify-credentials';
    adminHandler(req, res);
  });

  app.post('/api/admin', adminHandler);

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

  // GET /api/estimates/list - Get estimate list via JWT authorization
  app.get('/api/estimates/list', listEstimates);

  // Settings Endpoints
  app.get('/api/settings/get', (req, res) => {
    settingsHandler(req, res);
  });
  app.post('/api/settings/save', (req, res) => {
    req.body.action = 'save';
    settingsHandler(req, res);
  });
  app.post('/api/settings/test-email', (req, res) => {
    req.body.action = 'test-email';
    settingsHandler(req, res);
  });
  app.get('/api/settings', (req, res) => {
    settingsHandler(req, res);
  });
  app.post('/api/settings', (req, res) => {
    settingsHandler(req, res);
  });

  // Consolidated write endpoint for estimates (POST for saves/creates, PUT for updates, DELETE/POST for deletes)
  app.post('/api/estimates/write', writeEstimate);
  app.put('/api/estimates/write', writeEstimate);
  app.delete('/api/estimates/write', writeEstimate);

  // POST /api/webhooks/ghl - Proxy to GoHighLevel webhook to keep GHL_WEBHOOK_URL secure and handle CORS.
  app.post('/api/webhooks/ghl', async (req, res) => {
    try {
      console.log('Incoming GHL Webhook post payload:', req.body);
      const {
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        zip,
        fenceType,
        linearFeet,
        gateCount,
        estimatedPrice
      } = req.body;

      // Validate all required fields before submission
      if (!firstName || !lastName || !email || !phone || !address || !city || !state || !zip) {
        return res.status(400).json({ error: 'All contact and address fields (firstName, lastName, email, phone, address, city, state, zip) are required.' });
      }

      const ghlWebhookUrl = process.env.GHL_WEBHOOK_URL;
      if (!ghlWebhookUrl) {
        console.error('GHL_WEBHOOK_URL environment variable is not configured');
        return res.status(500).json({ error: 'GoHighLevel Webhook URL is not configured on the server. Please define GHL_WEBHOOK_URL in environment configuration.' });
      }

      // Format phone number correctly for GoHighLevel (e.g. +1XXXXXXXXXX)
      const formatPhoneForGHL = (p: string): string => {
        const cleaned = p.replace(/\D/g, '');
        if (cleaned.length === 10) {
          return `+1${cleaned}`;
        } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
          return `+${cleaned}`;
        }
        return p; 
      };

      const ghlPayload = {
        firstName,
        lastName,
        email,
        phone: formatPhoneForGHL(phone),
        address,
        city,
        state,
        zip,
        fenceType: fenceType || '',
        linearFeet: String(linearFeet || '0'),
        gateCount: String(gateCount || '0'),
        estimatedPrice: String(estimatedPrice || '0.00'),
        leadSource: "Fence Estimator App"
      };

      console.log('Dispatching request to GHL webhook:', ghlWebhookUrl, 'Payload:', ghlPayload);

      const response = await fetch(ghlWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(ghlPayload)
      });

      const responseText = await response.text();
      console.log(`GHL Webhook response stats - Status: ${response.status}, Response:`, responseText);

      if (!response.ok) {
        throw new Error(`GHL Webhook returned status ${response.status}: ${responseText}`);
      }

      res.status(200).json({ success: true, message: 'Lead successfully dispatched to CRM webhook.', status: response.status, data: responseText });
    } catch (err: any) {
      console.error('Failed to submit lead to GHL:', err);
      res.status(500).json({ error: err.message || 'Transmission to CRM webhook failed.' });
    }
  });

  // GET /api/expenses/list - Get expenses list via JWT authorization
  app.get('/api/expenses/list', listExpenses);

  // Consolidated write endpoint for expenses (POST for saves/creates, DELETE/POST for deletes)
  app.post('/api/expenses/write', writeExpense);
  app.delete('/api/expenses/write', writeExpense);

  // GET /api/quotes/list - Get quotes list via JWT authorization
  app.get('/api/quotes/list', listQuotes);

  // GET /api/materials/list - Get materials list via JWT authorization
  app.get('/api/materials/list', listMaterials);

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

  // GET /api/estimates/:estimateId/public - Fetch estimate for customer signing/review (No auth required)
  app.get('/api/estimates/:estimateId/public', async (req, res) => {
    try {
      const { estimateId } = req.params;
      if (!db) return res.status(503).json({ error: 'Database service offline' });

      // First try root /estimates
      const docRef = doc(db, 'estimates', estimateId);
      const snap = await getDoc(docRef);
      
      let estimateData: any = null;
      if (snap.exists()) {
        estimateData = { id: snap.id, ...snap.data() };
      } else {
        // Look up nested
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const uDoc of usersSnap.docs) {
          const nestedRef = doc(db, 'users', uDoc.id, 'estimates', estimateId);
          const nestedSnap = await getDoc(nestedRef);
          if (nestedSnap.exists()) {
            estimateData = { id: nestedSnap.id, ...nestedSnap.data() };
            break;
          }
        }
      }

      if (!estimateData) {
        return res.status(404).json({ error: 'Estimate not found in database.' });
      }

      // Attach public company settings/branding for owner tenant
      const ownerUid = estimateData.userId || estimateData.uid || estimateData.ownerId;
      let companyConfig: any = null;
      if (ownerUid) {
        try {
          const settingsSnap = await getDoc(doc(db, 'companySettings', ownerUid));
          if (settingsSnap.exists()) {
            const data = settingsSnap.data() || {};
            // Security: Strip out critical SMTP credentials before returning to public client portal
            companyConfig = {
              companyName: data.companyName || '',
              companyEmail: data.companyEmail || '',
              companyPhone: data.companyPhone || '',
              companyWebsite: data.companyWebsite || '',
              companyLogo: data.companyLogo || '',
              googleReviewLink: data.googleReviewLink || '',
              estimateAcceptedMessage: data.estimateAcceptedMessage || '',
              estimateDeclinedMessage: data.estimateDeclinedMessage || ''
            };
          }
        } catch (settingsErr) {
          console.warn('Skipped reading company settings for public portal:', settingsErr);
        }
      }

      return res.json({
        ...estimateData,
        settings: companyConfig
      });
    } catch (error: any) {
      console.error('Error fetching public estimate:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/estimates/:estimateId/viewed - Record customer opening/viewing the estimate
  app.post('/api/estimates/:estimateId/viewed', async (req, res) => {
    try {
      const { estimateId } = req.params;
      if (!db) return res.status(503).json({ error: 'Database service offline' });

      let targetRef = doc(db, 'estimates', estimateId);
      let snap = await getDoc(targetRef);

      if (!snap.exists()) {
        // Find nested estimate if any
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const uDoc of usersSnap.docs) {
          const nestedRef = doc(db, 'users', uDoc.id, 'estimates', estimateId);
          const nestedSnap = await getDoc(nestedRef);
          if (nestedSnap.exists()) {
            targetRef = nestedRef;
            snap = nestedSnap;
            break;
          }
        }
      }

      if (!snap.exists()) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const docData = snap.data();
      const now = new Date().toISOString();
      const updates: any = {
        customerOpenedAt: docData.customerOpenedAt || now,
        customerViewedAt: now,
        customerOpenedIp: (req.ip || req.headers['x-forwarded-for'] || 'unknown').toString(),
        viewCount: (docData.viewCount || 0) + 1
      };

      await updateDoc(targetRef, updates);
      console.log(`Estimate ${estimateId} viewed tracking updated:`, updates);
      res.json({ success: true, tracking: updates });
    } catch (error: any) {
      console.error('Error recording estimate view:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/estimates/:estimateId/decision - Customer Accept/Decline action
  app.post('/api/estimates/:estimateId/decision', async (req, res) => {
    try {
      const { estimateId } = req.params;
      const { decision, signature, declineReason } = req.body;

      if (!decision || !['accepted', 'declined'].includes(decision)) {
        return res.status(400).json({ error: 'Invalid decision parameter. Must be "accepted" or "declined".' });
      }

      if (!db) return res.status(503).json({ error: 'Database service offline' });

      let targetRef = doc(db, 'estimates', estimateId);
      let snap = await getDoc(targetRef);

      if (!snap.exists()) {
        // Look up nested
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const uDoc of usersSnap.docs) {
          const nestedRef = doc(db, 'users', uDoc.id, 'estimates', estimateId);
          const nestedSnap = await getDoc(nestedRef);
          if (nestedSnap.exists()) {
            targetRef = nestedRef;
            snap = nestedSnap;
            break;
          }
        }
      }

      if (!snap.exists()) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const now = new Date().toISOString();
      const updates: any = {
        customerDecision: decision,
        customerDecisionDate: now,
        updatedAt: now
      };

      if (decision === 'accepted') {
        updates.customerSignature = signature || 'Digitally Signed';
        updates.jobStatus = 'Approved'; // Update CRM/Scheduler jobStatus automatically!
      } else {
        updates.customerDeclineReason = declineReason || 'Not specified';
        updates.jobStatus = 'Declined';
      }

      const data = snap.data() || {};
      const ownerUid = data.userId || data.uid || data.ownerId;
      
      let customAcceptedMessage = 'Estimate accepted successfully! We will finalize your installation timeframe shortly.';
      let customDeclinedMessage = 'Estimate declined. We will reach out to understand your feedback. Thank you!';
      let webhookUrl = '';

      if (ownerUid) {
        try {
          const settingsSnap = await getDoc(doc(db, 'companySettings', ownerUid));
          if (settingsSnap.exists()) {
            const settingsData = settingsSnap.data() || {};
            webhookUrl = settingsData.gohighlevelWebhookUrl || settingsData.ghlWebhookUrl || '';
            if (settingsData.estimateAcceptedMessage) {
              customAcceptedMessage = settingsData.estimateAcceptedMessage;
            }
            if (settingsData.estimateDeclinedMessage) {
              customDeclinedMessage = settingsData.estimateDeclinedMessage;
            }
          }
        } catch (settingsError) {
          console.warn('Could not load companySettings for webhooks/templates:', settingsError);
        }
      }

      // Embed the custom message inside updates for returning to UI portal
      updates.customMessage = decision === 'accepted' ? customAcceptedMessage : customDeclinedMessage;

      // Dispatch webhook asynchronously
      if (webhookUrl) {
        try {
          const webhookPayload = {
            event: `estimate_${decision}`,
            estimateId,
            estimateNumber: data.estimateNumber || '',
            decision,
            customerName: data.customerName || '',
            customerEmail: data.customerEmail || '',
            totalCost: data.totalCost || data.manualGrandTotal || 0,
            signature: signature || '',
            declineReason: declineReason || '',
            timestamp: now
          };
          fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhookPayload)
          }).then(response => {
            console.log(`Outbound SaaS webhook trigger response: status ${response.status}`);
          }).catch(webhookErr => {
            console.error(`Dynamic Webhook dispatch failed:`, webhookErr);
          });
        } catch (webhookOuterError) {
          console.error(`Webhook trigger parse error:`, webhookOuterError);
        }
      }

      await updateDoc(targetRef, updates);
      console.log(`Estimate ${estimateId} decision recorded:`, updates);
      res.json({ success: true, decision: updates });
    } catch (error: any) {
      console.error('Error processing estimate decision:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/estimates/send - Unified endpoint supporting body parameters
  app.post('/api/estimates/send', sendEstimate);

  // POST /api/estimates/:estimateId/send - Compatibility path forwarding to modular sendEstimate handler
  app.post('/api/estimates/:estimateId/send', sendEstimate);

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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
