import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK safely
if (admin.apps.length === 0) {
  const firebaseConfigEnv = process.env.FIREBASE_CONFIG;
  if (firebaseConfigEnv) {
    try {
      const parsedConfig = JSON.parse(firebaseConfigEnv);
      if (parsedConfig.private_key || parsedConfig.client_email) {
        admin.initializeApp({
          credential: admin.credential.cert(parsedConfig),
        });
      } else {
        admin.initializeApp({
          projectId: parsedConfig.projectId || 'dazzling-card-485210-r8',
        });
      }
    } catch (error) {
      console.error('Error parsing FIREBASE_CONFIG env in admin registry:', error);
      admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
    }
  } else {
    admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

function verifyAdminToken(req: any): { email: string; uid: string } | null {
  const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
  const tokenBody = req.body?.adminToken;
  
  let tokenStr = '';
  if (authHeader) {
    const authStr = typeof authHeader === 'string' ? authHeader : String(authHeader);
    tokenStr = authStr.toLowerCase().startsWith('bearer ')
      ? authStr.substring(7).trim()
      : authStr.trim();
  } else if (tokenBody) {
    tokenStr = String(tokenBody).trim();
  }

  if (!tokenStr || tokenStr === 'null' || tokenStr === 'undefined') {
    return null;
  }

  try {
    const activeSecret = process.env.JWT_SECRET || 'lone-star-fence-secret';
    const decoded: any = jwt.verify(tokenStr, activeSecret);
    if (decoded && typeof decoded === 'object' && decoded.isAdmin) {
      return { email: decoded.email, uid: decoded.uid };
    }
  } catch (err) {
    try {
      const decoded: any = jwt.verify(tokenStr, 'lone-star-fence-secret');
      if (decoded && typeof decoded === 'object' && decoded.isAdmin) {
        return { email: decoded.email, uid: decoded.uid };
      }
    } catch (err2) {
      return null;
    }
  }
  return null;
}

export default async function handler(req: any, res: any) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Admin-Token, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Route by req.body.action
  const action = req.body?.action || req.query?.action;

  if (!action) {
    return res.status(400).json({ error: 'Missing action field inside payload.' });
  }

  try {
    if (action === 'login') {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const emailLower = email.toLowerCase().trim();
      const pwd = password.trim();

      if (emailLower !== 'bradens@lonestarfenceworks.com' && emailLower !== 'usmc6123@gmail.com') {
        return res.status(403).json({ error: 'Access denied. Unauthorized admin email.' });
      }

      // Query /admins collection by email
      const adminsSnap = await db.collection('admins').get();
      const adminDoc = adminsSnap.docs.find((d: any) => d.data().email?.toLowerCase() === emailLower);

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

      return res.status(200).json({
        success: true,
        token,
        admin: {
          email: adminData.email,
          uid: adminUid,
          canAccessAllData: adminData.canAccessAllData || true,
          isAdmin: true
        }
      });

    } else if (action === 'register') {
      const { name, email, password, tier, subscriptionTier } = req.body;
      
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, Email, and Password are required' });
      }

      const emailLower = email.toLowerCase().trim();

      // Check for duplicate accounts in users and admins
      const usersQuery = await db.collection('users')
        .where('email', '==', emailLower)
        .limit(1)
        .get();

      const adminsQuery = await db.collection('admins')
        .where('email', '==', emailLower)
        .limit(1)
        .get();

      if (!usersQuery.empty || !adminsQuery.empty) {
        return res.status(400).json({ error: 'An account with this email already exists' });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password.trim(), salt);

      const userId = `usr-${Math.random().toString(36).substring(2, 11)}`;
      const chosenTier = tier || subscriptionTier || 'free';

      const newUser = {
        uid: userId,
        email: emailLower,
        name: name.trim(),
        displayName: name.trim(),
        tier: chosenTier,
        subscriptionTier: chosenTier,
        passwordHash,
        createdAt: new Date().toISOString(),
        isDisabled: false,
        isAdmin: false
      };

      await db.collection('users').doc(userId).set(newUser);
      return res.status(200).json(newUser);

    } else if (action === 'verify-credentials') {
      const authHeader = req.headers['x-admin-token'] || req.headers.authorization;
      console.log('[Verify Credentials Unified Log] Received Authorization/X-Admin-Token header:', authHeader ? 'Present' : 'Missing');

      if (!authHeader) {
        console.warn('[Verify Credentials Unified Log] Verification skipped/failed: Missing credential headers.');
        return res.status(401).json({
          success: false,
          valid: false,
          error: 'Admin authentication is required. Token is missing.'
        });
      }

      const authStr = typeof authHeader === 'string' ? authHeader : String(authHeader);
      const tokenHttp = authStr.toLowerCase().startsWith('bearer ')
        ? authStr.substring(7).trim()
        : authStr.trim();

      if (!tokenHttp || tokenHttp === 'null' || tokenHttp === 'undefined' || tokenHttp === '') {
        console.warn('[Verify Credentials Unified Log] Denying verification: Token resolved to empty, null, or undefined.');
        return res.status(401).json({
          success: false,
          valid: false,
          error: 'Admin authentication is required. Token is invalid or empty.'
        });
      }

      let decoded: any = null;

      // 1. Try process.env.JWT_SECRET if specified
      if (process.env.JWT_SECRET) {
        try {
          decoded = jwt.verify(tokenHttp, process.env.JWT_SECRET);
          console.log('[Verify Credentials Unified Log] Successfully verified token with custom JWT_SECRET.');
        } catch (err: any) {
          console.warn('[Verify Credentials Unified Log] Custom JWT_SECRET verification failed:', err.message || err);
        }
      }

      // 2. Try the fallback secret 'lone-star-fence-secret'
      if (!decoded) {
        try {
          decoded = jwt.verify(tokenHttp, 'lone-star-fence-secret');
          console.log('[Verify Credentials Unified Log] Successfully verified token with fallback "lone-star-fence-secret".');
        } catch (err: any) {
          console.error('[Verify Credentials Unified Log] Failed to verify token with both custom and fallback secrets.');
          return res.status(401).json({
            success: false,
            valid: false,
            error: `Access denied. Invalid or expired admin token. Reason: ${err.message || 'unknown'}`
          });
        }
      }

      // 3. Ensure isAdmin is true
      if (decoded && typeof decoded === 'object' && decoded.isAdmin) {
        console.log('[Verify Credentials Unified Log] Verified admin user:', decoded.email);

        // Generate a fresh 24-hour token
        const activeSecret = process.env.JWT_SECRET || 'lone-star-fence-secret';
        const refreshedToken = jwt.sign(
          { email: decoded.email, isAdmin: true, uid: decoded.uid },
          activeSecret,
          { expiresIn: '24h' }
        );

        return res.status(200).json({
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

      console.warn('[Verify Credentials Unified Log] Decoded token is valid, but missing isAdmin role flag. Payload:', decoded);
      return res.status(401).json({
        success: false,
        valid: false,
        error: 'Access denied. Account is not an administrator.'
      });

    } else if (action === 'create-employee') {
      const issuer = verifyAdminToken(req);
      if (!issuer) {
        return res.status(401).json({ error: 'Admin authentication is required. Token is invalid or missing.' });
      }

      const {
        email,
        password,
        name,
        phone,
        role,
        permission,
        permissionLevel,
        active,
        isActive,
        canReceiveCrewDispatch,
        canReceiveCrewDispatchEmails,
        isPrimaryCrewContact,
        primaryCrewContact
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const targetEmail = email.toLowerCase().trim();
      const targetPassword = password.trim();
      const nameVal = (name || '').trim();
      const phoneVal = (phone || '').trim();
      const roleVal = (role || '').trim();
      const permissionVal = permissionLevel || permission || 'View Only';

      const activeVal = active !== undefined ? active : (isActive !== undefined ? isActive : true);
      const canReceiveVal = canReceiveCrewDispatchEmails !== undefined ? canReceiveCrewDispatchEmails : (canReceiveCrewDispatch !== undefined ? canReceiveCrewDispatch : true);
      const isPrimaryVal = primaryCrewContact !== undefined ? primaryCrewContact : (isPrimaryCrewContact !== undefined ? isPrimaryCrewContact : false);

      const empDocRef = db.collection('employees').doc(targetEmail);
      const empDocSnap = await empDocRef.get();

      // Check if standard Auth user already exists
      let authUserExists = false;
      let existingAuthUser: any = null;
      try {
        existingAuthUser = await admin.auth().getUserByEmail(targetEmail);
        authUserExists = true;
      } catch (authLookErr: any) {
        if (authLookErr.code !== 'auth/user-not-found') {
          throw authLookErr;
        }
      }

      // If document already exists:
      if (empDocSnap.exists) {
        return res.status(400).json({ error: 'Email already belongs to an employee.' });
      }

      // If Auth user already exists but document does NOT:
      if (authUserExists && !empDocSnap.exists) {
        try {
          // Unset any previous primary contacts if this is checked as primary
          if (isPrimaryVal) {
            const primarySnap = await db.collection('employees').where('isPrimaryCrewContact', '==', true).get();
            const batch = db.batch();
            primarySnap.forEach((doc: any) => {
              if (doc.id !== targetEmail) {
                batch.update(doc.ref, {
                  isPrimaryCrewContact: false,
                  primaryCrewContact: false,
                  updatedAt: new Date().toISOString()
                });
              }
            });
            await batch.commit();
          }

          // Update password and display name of the existing Auth user to match input
          if (existingAuthUser) {
            await admin.auth().updateUser(existingAuthUser.uid, {
              password: targetPassword,
              displayName: nameVal
            });
          }

          await empDocRef.set({
            email: targetEmail,
            name: nameVal,
            phone: phoneVal,
            role: roleVal,
            password: targetPassword,
            permission: permissionVal,
            permissionLevel: permissionVal,
            isActive: activeVal,
            active: activeVal,
            canReceiveCrewDispatch: canReceiveVal,
            canReceiveCrewDispatchEmails: canReceiveVal,
            isPrimaryCrewContact: isPrimaryVal,
            primaryCrewContact: isPrimaryVal,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          return res.status(200).json({
            success: true,
            repaired: true,
            message: 'Existing Auth user repaired with employee profile.'
          });
        } catch (dbErr: any) {
          return res.status(500).json({ error: `Permission denied creating employee profile: ${dbErr.message || dbErr}` });
        }
      }

      // Both do not exist: Create Auth user first
      let newAuthUser: any = null;
      try {
        newAuthUser = await admin.auth().createUser({
          email: targetEmail,
          password: targetPassword,
          displayName: nameVal
        });
      } catch (authErr: any) {
        return res.status(400).json({ error: authErr.message || 'Failed to create authentication user.' });
      }

      // Now create Firestore document
      try {
        if (isPrimaryVal) {
          const primarySnap = await db.collection('employees').where('isPrimaryCrewContact', '==', true).get();
          const batch = db.batch();
          primarySnap.forEach((doc: any) => {
            if (doc.id !== targetEmail) {
              batch.update(doc.ref, {
                isPrimaryCrewContact: false,
                primaryCrewContact: false,
                updatedAt: new Date().toISOString()
              });
            }
          });
          await batch.commit();
        }

        await empDocRef.set({
          email: targetEmail,
          name: nameVal,
          phone: phoneVal,
          role: roleVal,
          password: targetPassword,
          permission: permissionVal,
          permissionLevel: permissionVal,
          isActive: activeVal,
          active: activeVal,
          canReceiveCrewDispatch: canReceiveVal,
          canReceiveCrewDispatchEmails: canReceiveVal,
          isPrimaryCrewContact: isPrimaryVal,
          primaryCrewContact: isPrimaryVal,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        return res.status(200).json({
          success: true,
          repaired: false,
          message: `Employee ${targetEmail} added successfully!`
        });
      } catch (dbErr: any) {
        // Rollback creation of auth user
        if (newAuthUser) {
          try {
            await admin.auth().deleteUser(newAuthUser.uid);
          } catch (delErr) {
            console.error('[ROLLBACK FAIL] Failed to clean up Auth user during failed employee registration:', delErr);
          }
        }
        return res.status(403).json({
          error: 'Auth user created but employee profile failed: Permission denied creating employee profile.'
        });
      }

    } else {
      return res.status(400).json({ error: `Action '${action}' is not supported.` });
    }
  } catch (error: any) {
    console.error(`Unified admin error on '${action}':`, error);
    return res.status(500).json({ error: error.message || 'Internal server processor error.' });
  }
}
