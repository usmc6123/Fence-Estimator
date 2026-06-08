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
import { listUsers } from './api/admin/users/list';
import { createUser } from './api/admin/users/create';
import { updateUser } from './api/admin/users/update';
import { deleteUser } from './api/admin/users/delete';
import listEstimates from './api/estimates/list';
import listExpenses from './api/expenses/list';

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
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const emailLower = email.toLowerCase().trim();
      const pwd = password.trim();

      if (emailLower !== 'bradens@lonestarfenceworks.com' && emailLower !== 'usmc6123@gmail.com') {
        return res.status(403).json({ error: 'Access denied. Unauthorized admin email.' });
      }

      if (!db) {
        return res.status(503).json({ error: 'Database service is temporarily unavailable.' });
      }

      // Query /admins collection by email
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
         return res.status(401).json({ error: 'Invalid admin credentials.' });
      }

      // Create JWT
      const token = jwt.sign(
        { email: adminData.email, isAdmin: true, uid: adminUid },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        admin: {
          email: adminData.email,
          uid: adminUid,
          canAccessAllData: adminData.canAccessAllData || true,
          isAdmin: true
        }
      });
    } catch (error: any) {
      console.error('Admin login error:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
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
  app.get('/api/admin/users', authenticateAdmin, (req, res) => listUsers(req, res, db));

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
  app.post('/api/admin/verify-credentials', async (req, res) => {
    try {
      const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'Admin authentication is required. Token is missing.' });
      }
      const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;
      
      const decoded = jwt.verify(token as string, JWT_SECRET) as any;
      if (decoded && typeof decoded === 'object' && decoded.isAdmin) {
        // Generate a new refreshed 24-hour token to keep session active
        const refreshedToken = jwt.sign(
          { email: decoded.email, isAdmin: true, uid: decoded.uid },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        return res.json({
          success: true,
          valid: true,
          token: refreshedToken,
          admin: {
            email: decoded.email,
            uid: decoded.uid,
            isAdmin: true
          }
        });
      }
      return res.status(401).json({ success: false, valid: false, error: 'Access denied. Invalid token.' });
    } catch (err: any) {
      // Suppress noisy verification warnings in standard output to keep integration logs clean
      return res.status(401).json({ success: false, valid: false, error: 'Access denied. Invalid or expired admin token.' });
    }
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

  // GET /api/estimates/list - Get estimate list via JWT authorization
  app.get('/api/estimates/list', listEstimates);

  // GET /api/expenses/list - Get expenses list via JWT authorization
  app.get('/api/expenses/list', listExpenses);

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
      
      if (snap.exists()) {
        return res.json({ id: snap.id, ...snap.data() });
      }

      // If not found in root, fallback/scan in /users/*/estimates for backward compatibility
      const usersSnap = await getDocs(collection(db, 'users'));
      for (const uDoc of usersSnap.docs) {
        const nestedRef = doc(db, 'users', uDoc.id, 'estimates', estimateId);
        const nestedSnap = await getDoc(nestedRef);
        if (nestedSnap.exists()) {
          return res.json({ id: nestedSnap.id, ...nestedSnap.data() });
        }
      }
      
      return res.status(404).json({ error: 'Estimate not found in database.' });
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

      await updateDoc(targetRef, updates);
      console.log(`Estimate ${estimateId} decision recorded:`, updates);
      res.json({ success: true, decision: updates });
    } catch (error: any) {
      console.error('Error processing estimate decision:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/estimates/:estimateId/send - Send estimate URL to customer email (Authenticated user only)
  app.post('/api/estimates/:estimateId/send', async (req, res) => {
    try {
      const { estimateId } = req.params;
      const { customerEmail, subject, message, senderEmail } = req.body;

      if (!customerEmail) {
        return res.status(400).json({ error: 'Customer email is required.' });
      }

      if (!db) return res.status(503).json({ error: 'Database service offline' });

      // Find the estimate document
      let targetRef = doc(db, 'estimates', estimateId);
      let snap = await getDoc(targetRef);

      if (!snap.exists()) {
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

      const estimateData = snap.data();
      const customerName = estimateData.customerName || 'Value Customer';
      
      // Build the direct access portal URL safely mirroring whatever protocol/host was requested
      const host = req.headers.host || 'localhost:3000';
      const protocol = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http';
      const estimateLink = `${protocol}://${host}/?portal=contract&estimateId=${estimateId}`;

      const defaultSubject = `Fence Installation Contract Agreement - Lone Star Fence Works`;
      const defaultMessage = `Hello ${customerName},\n\nWe have generated your custom fencing contract agreement estimate. Please review and sign the agreement directly on your device using the link below:\n\n${estimateLink}\n\nThank you for choosing Lone Star Fence Works!\n\nBest regards,\nLone Star Fence Works Estimations Department`;

      const mailSubject = subject || defaultSubject;
      const mailMessage = message || defaultMessage;

      const fromEmail = senderEmail || process.env.SMTP_USER || 'BradenS@LoneStarFenceWorks.com';

      // 1. Send the email using Nodemailer
      let mailSent = false;
      let mailError = null;

      try {
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = Number(process.env.SMTP_PORT) || 587;
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;

        if (smtpHost && smtpUser && smtpPass) {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass
            }
          });

          await transporter.sendMail({
            from: `"${senderEmail ? 'Lone Star Estimator' : 'Lone Star Fence Works'}" <${fromEmail}>`,
            to: customerEmail,
            subject: mailSubject,
            text: mailMessage,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="background-color: #0c1a30; padding: 24px; text-align: center; border-bottom: 4px solid #b91c1c;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">LONE STAR FENCE WORKS</h1>
                  <p style="color: #ef4444; margin: 6px 0 0 0; font-weight: bold; letter-spacing: 4px; font-size: 11px;">ESTIMATE PORTAL AGREEMENT</p>
                </div>
                <div style="padding: 32px 24px; background-color: #ffffff;">
                  <h2 style="color: #0c1a30; font-size: 18px; margin-top: 0;">Fencing Estimate Prepared for ${customerName}</h2>
                  <p style="color: #4a5568; line-height: 1.6; font-size: 14px;">
                    Dear ${customerName},
                  </p>
                  <p style="color: #4a5568; line-height: 1.6; font-size: 14px;">
                    We have compiled and drafted your structural fence installation contract. To review your customized line-by-line pricing and sign off on the workmanship warranty agreement, please click the secure button below:
                  </p>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${estimateLink}" style="background-color: #0c1a30; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: bold; font-size: 14px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; border-bottom: 3px solid #b91c1c;">
                      Review & Sign Contract Agreement
                    </a>
                  </div>
                  <p style="color: #718096; font-size: 12px; line-height: 1.5;">
                    If the button doesn't work, copy and paste the following URL into your browser's address bar:<br/>
                    <a href="${estimateLink}" style="color: #3182ce;">${estimateLink}</a>
                  </p>
                  <p style="color: #4a5568; line-height: 1.6; font-size: 14px; margin-top: 24px;">
                    Our office is checking daily for signed contracts to finalize schedule options. Let us know if you need any adjustments.
                  </p>
                  <p style="color: #4a5568; margin-bottom: 0; font-size: 14px;">
                    Best regards,<br/>
                    <strong>Braden</strong><br/>
                    Lone Star Fence Works
                  </p>
                </div>
                <div style="background-color: #f7fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #edf2f7;">
                  <p style="color: #a0aec0; font-size: 11px; margin: 0;">
                    Lone Star Fence Works &bull; Texas Premium Estimating System &bull; Confidential
                  </p>
                </div>
              </div>
            `
          });
          mailSent = true;
          console.log(`Email successfully dispatched via SMTP to ${customerEmail}`);
        } else {
          console.log(`SMTP credentials are not configured. Falling back to backend logs for local preview delivery.`);
          console.log("================= SIMULATED OUTBOX MESSAGE =================");
          console.log(`From: ${fromEmail}`);
          console.log(`To: ${customerEmail}`);
          console.log(`Subject: ${mailSubject}`);
          console.log(`Direct Link: ${estimateLink}`);
          console.log(`Body:\n${mailMessage}`);
          console.log("============================================================");
          mailSent = true;
        }
      } catch (err: any) {
        console.error('Nodemailer SMTP dispatch failed:', err);
        mailError = err.message || err;
      }

      // 2. Update the Estimate document to record the send status
      const now = new Date().toISOString();
      const existingLogs = estimateData.customerEmailLog || [];
      const updates: any = {
        customerEmailSent: true,
        customerSentAt: now,
        customerEmailLog: [...existingLogs, {
          sentAt: now,
          customerEmail,
          subject: mailSubject,
          senderEmail: fromEmail,
          mailSent,
          mailError,
          portalUrl: estimateLink
        }],
        updatedAt: now
      };

      await updateDoc(targetRef, updates);

      res.json({
        success: true,
        mailSent,
        mailError,
        portalUrl: estimateLink,
        sentAt: now
      });
    } catch (error: any) {
      console.error('Error in send estimate route:', error);
      res.status(500).json({ error: error.message || 'Error occurred while sending.' });
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
