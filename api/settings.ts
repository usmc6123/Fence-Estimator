import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
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
      console.error('Error parsing FIREBASE_CONFIG env in settings unified:', error);
      admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
    }
  } else {
    admin.initializeApp({ projectId: 'dazzling-card-485210-r8' });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Authentication check
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token header' });
    }

    const token = authHeader.split(' ')[1];
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err: any) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    const uid = decoded.uid;
    if (!uid) {
      return res.status(401).json({ error: 'Unauthorized: Invalid credentials payload' });
    }

    const method = req.method;

    if (method === 'GET') {
      // Retrieve Settings from /companySettings/{uid}
      const settingsDoc = await db.collection('companySettings').doc(uid).get();
      
      if (!settingsDoc.exists) {
        // Return empty default state if not found
        return res.status(200).json({
          id: uid,
          companyName: '',
          companyEmail: '',
          companyPhone: '',
          companyWebsite: '',
          companyLogo: '',
          smtpHost: '',
          smtpPort: 465,
          smtpSecureType: 'SSL/TLS',
          smtpUsername: '',
          smtpPassword: '', // empty on start
          fromEmail: '',
          fromName: '',
          replyToEmail: '',
          gohighlevelWebhookUrl: '',
          googleReviewLink: '',
          estimateEmailSubject: '',
          estimateEmailBody: '',
          estimateAcceptedMessage: '',
          estimateDeclinedMessage: '',
          ghlWebhookInstantEstimateSubmitted: '',
          ghlWebhookManualEstimateSent: '',
          ghlWebhookEstimateAccepted: '',
          ghlWebhookEstimateCompleted: '',
          ghlWebhookEstimateDeclined: ''
        });
      }

      const data = settingsDoc.data() || {};
      
      // Mask sensitive fields like smtpPassword for secure retrieval
      if (data.smtpPassword) {
        data.smtpPassword = '••••••••';
      }

      return res.status(200).json({ id: uid, ...data });

    } else if (method === 'POST') {
      const { action } = req.body;

      if (action === 'save') {
        const incomingFields = req.body;
        const {
          companyName,
          companyEmail,
          companyPhone,
          companyWebsite,
          companyLogo,
          scheduleLink,
          smtpHost,
          smtpPort,
          smtpSecureType,
          smtpUsername,
          smtpPassword,
          fromEmail,
          fromName,
          replyToEmail,
          gohighlevelWebhookUrl,
          googleReviewLink,
          estimateEmailSubject,
          estimateEmailBody,
          estimateAcceptedMessage,
          estimateDeclinedMessage,
          ghlWebhookInstantEstimateSubmitted,
          ghlWebhookManualEstimateSent,
          ghlWebhookEstimateAccepted,
          ghlWebhookEstimateCompleted,
          ghlWebhookEstimateDeclined
        } = incomingFields;

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (fromEmail && !emailRegex.test(fromEmail)) {
          return res.status(400).json({ error: 'Invalid From Email format.' });
        }
        if (companyEmail && !emailRegex.test(companyEmail)) {
          return res.status(400).json({ error: 'Invalid Company Email format.' });
        }

        // SMTP Host check
        if (!smtpHost) {
          return res.status(400).json({ error: 'SMTP Host cannot be blank.' });
        }

        // SMTP Port check
        const numericPort = Number(smtpPort);
        if (!smtpPort || isNaN(numericPort)) {
          return res.status(400).json({ error: 'Numeric SMTP Port is required.' });
        }

        // SMTP Username check
        if (!smtpUsername) {
          return res.status(400).json({ error: 'SMTP Username is required.' });
        }

        // Check existing document to retain existing password if masked is sent
        const settingsDocRef = db.collection('companySettings').doc(uid);
        const existingDoc = await settingsDocRef.get();
        const existingData = existingDoc.exists ? existingDoc.data() : {};

        let finalPassword = smtpPassword;
        if (smtpPassword === '••••••••' || !smtpPassword) {
          if (existingData && existingData.smtpPassword) {
            finalPassword = existingData.smtpPassword;
          } else {
            return res.status(400).json({ error: 'SMTP Password is required for initial setup.' });
          }
        }

        const updatedSettings = {
          id: uid,
          companyName: companyName || '',
          companyEmail: companyEmail || '',
          companyPhone: companyPhone || '',
          companyWebsite: companyWebsite || '',
          companyLogo: companyLogo || '',
          scheduleLink: scheduleLink || '',
          smtpHost: smtpHost,
          smtpPort: numericPort,
          smtpSecureType: smtpSecureType || 'SSL/TLS',
          smtpUsername: smtpUsername,
          smtpPassword: finalPassword,
          fromEmail: fromEmail || '',
          fromName: fromName || '',
          replyToEmail: replyToEmail || '',
          gohighlevelWebhookUrl: gohighlevelWebhookUrl || '',
          ghlWebhookUrl: gohighlevelWebhookUrl || '', // Maintain compatibility for both forms
          googleReviewLink: googleReviewLink || '',
          estimateEmailSubject: estimateEmailSubject || '',
          estimateEmailBody: estimateEmailBody || '',
          estimateAcceptedMessage: estimateAcceptedMessage || '',
          estimateDeclinedMessage: estimateDeclinedMessage || '',
          ghlWebhookInstantEstimateSubmitted: ghlWebhookInstantEstimateSubmitted || '',
          ghlWebhookManualEstimateSent: ghlWebhookManualEstimateSent || '',
          ghlWebhookEstimateAccepted: ghlWebhookEstimateAccepted || '',
          ghlWebhookEstimateCompleted: ghlWebhookEstimateCompleted || '',
          ghlWebhookEstimateDeclined: ghlWebhookEstimateDeclined || '',
          updatedAt: new Date().toISOString()
        };

        await settingsDocRef.set(updatedSettings, { merge: true });
        return res.status(200).json({ success: true, message: 'Settings saved successfully.' });

      } else if (action === 'test-email') {
        const {
          smtpHost,
          smtpPort,
          smtpSecureType,
          smtpUsername,
          smtpPassword,
          fromEmail,
          fromName,
          recipientEmail
        } = req.body;

        if (!recipientEmail) {
          return res.status(400).json({ error: 'Recipient Email address is required to dispatch the test message.' });
        }

        // 1. Resolve candidate settings with exact fallback pattern
        let resolvedSmtpHost = smtpHost || process.env.SMTP_HOST || '';
        let resolvedSmtpPort = Number(smtpPort) || Number(process.env.SMTP_PORT) || 465;
        let resolvedSmtpUser = smtpUsername || process.env.SMTP_USER || '';
        let resolvedSmtpPass = (smtpPassword !== '••••••••' && smtpPassword) ? smtpPassword : (process.env.SMTP_PASS || '');
        let resolvedFromName = fromName || 'Lone Star Fence Works';
        let resolvedFromEmail = fromEmail || process.env.FROM_EMAIL || resolvedSmtpUser || '';

        // If fromEmail is still blank, try companySettings fallback
        let dbSettings: any = null;
        try {
          const settingsDocSnap = await db.collection('companySettings').doc(uid).get();
          if (settingsDocSnap.exists) {
            dbSettings = settingsDocSnap.data() || {};
          }
        } catch (dbErr) {
          console.warn('[SMTP DIAGNOSTIC] Failed to read companySettings from firestore:', dbErr);
        }

        if (dbSettings) {
          if (!resolvedSmtpHost && dbSettings.smtpHost) resolvedSmtpHost = dbSettings.smtpHost;
          if (!smtpPort && dbSettings.smtpPort) resolvedSmtpPort = Number(dbSettings.smtpPort);
          if (!resolvedSmtpUser && dbSettings.smtpUsername) resolvedSmtpUser = dbSettings.smtpUsername;
          if ((smtpPassword === '••••••••' || !smtpPassword) && dbSettings.smtpPassword) {
            resolvedSmtpPass = dbSettings.smtpPassword;
          }
          if (!fromName && dbSettings.fromName) resolvedFromName = dbSettings.fromName;
          if (!fromEmail && dbSettings.fromEmail) resolvedFromEmail = dbSettings.fromEmail;
        }

        if (!resolvedSmtpHost) {
          return res.status(400).json({ error: 'SMTP Host cannot be resolved. Please enter a host name.' });
        }
        if (!resolvedSmtpUser) {
          return res.status(400).json({ error: 'SMTP Username is required.' });
        }

        // Direct SSL/TLS check (secure: true) ONLY for port 465
        const isSecure = resolvedSmtpPort === 465;

        const transportConfig: any = {
          host: resolvedSmtpHost,
          port: resolvedSmtpPort,
          secure: isSecure,
          auth: {
            user: resolvedSmtpUser,
            pass: resolvedSmtpPass
          },
          connectionTimeout: 6000,
          greetingTimeout: 6000,
          socketTimeout: 6000,
          tls: {
            rejectUnauthorized: false
          }
        };

        const transporter = nodemailer.createTransport(transportConfig);

        // Call transporter.verify()
        let isConfigVerified = false;
        let verifyErrorCode = '';
        let verifyErrorMessage = '';
        let verifySmtpResponse = '';

        try {
          await transporter.verify();
          isConfigVerified = true;
          console.log(`[SMTP DIAGNOSTIC SUCCESS] SMTP connection verify succeeded for ${resolvedSmtpHost}:${resolvedSmtpPort}`);
        } catch (verifyErr: any) {
          console.warn(`[SMTP DIAGNOSTIC FAILURE] SMTP connection verify failed:`, verifyErr);
          verifyErrorCode = verifyErr.code || 'VERIFICATION_FAILED';
          verifyErrorMessage = verifyErr.message || String(verifyErr);
          verifySmtpResponse = verifyErr.response || '';
        }

        if (!isConfigVerified) {
          return res.status(200).json({
            success: false,
            smtpHost: resolvedSmtpHost,
            smtpPort: resolvedSmtpPort,
            secure: isSecure,
            fromEmail: resolvedFromEmail,
            errorCode: verifyErrorCode,
            errorMessage: verifyErrorMessage,
            smtpResponse: verifySmtpResponse,
            details: `SMTP Authentication or Handshake failed on verify() call. [Code: ${verifyErrorCode}]`
          });
        }

        try {
          const info = await transporter.sendMail({
            from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
            to: recipientEmail,
            subject: `[SYSTEM TEST] Secure SMTP Connection Verified!`,
            text: `Hello!\n\nThis is a secure system authentication check sent from your Lone Star Fence SaaS Admin Console Settings.\n\nYour current connection profile and credentials have been verified successfully on port ${resolvedSmtpPort}.\n\nTime of verification: ${new Date().toLocaleString()}\nHost: ${resolvedSmtpHost}\nUsername: ${resolvedSmtpUser}\n\nHave a great day!\nSystem Engineering Department`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
                <h2 style="color: #10b981; margin-top: 0;">✓ Connection Verified Successfully!</h2>
                <p>Hello,</p>
                <p>This is an automated connection check message dispatched from your Lone Star Fence SaaS Admin Console Settings.</p>
                <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px; margin: 18px 0; font-family: monospace; font-size: 13px;">
                  <strong>Host:</strong> ${resolvedSmtpHost}<br/>
                  <strong>Port:</strong> ${resolvedSmtpPort}<br/>
                  <strong>Username:</strong> ${resolvedSmtpUser}<br/>
                  <strong>Verified At:</strong> ${new Date().toLocaleString()}
                </div>
                <p>Your custom SMTP authentication credentials and server pathways are clear and fully operational!</p>
                <p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                  Lone Star Fence Works - Multi-tenant SaaS Node
                </p>
              </div>
            `
          });

          return res.status(200).json({
            success: true,
            smtpHost: resolvedSmtpHost,
            smtpPort: resolvedSmtpPort,
            secure: isSecure,
            fromEmail: resolvedFromEmail,
            smtpResponse: info.response || 'Message accepted by SMTP relay'
          });
        } catch (err: any) {
          const errorMessage = err.message || String(err);
          console.warn('[SMTP TEST EMAIL FAILURE ON SEND]:', err);
          
          let clientMsg = '';
          if (err.code === 'EAUTH' || errorMessage.toLowerCase().includes('auth')) {
            clientMsg = 'SMTP Connection was established, but authentication was rejected. Please verify your SMTP Username and Password.';
          } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEOUT' || err.code === 'ENOTFOUND') {
            clientMsg = `Could not connect to the SMTP mail server at ${resolvedSmtpHost}:${resolvedSmtpPort}. Verify the host name, port, and security type configuration.`;
          } else {
            clientMsg = `SMTP Send Failed: ${errorMessage}`;
          }

          return res.status(200).json({
            success: false,
            smtpHost: resolvedSmtpHost,
            smtpPort: resolvedSmtpPort,
            secure: isSecure,
            fromEmail: resolvedFromEmail,
            errorCode: err.code || 'SEND_FAILED',
            errorMessage: clientMsg,
            smtpResponse: err.response || '',
            details: err.message || String(err)
          });
        }
      } else {
        return res.status(400).json({ error: 'Invalid run action inside settings handler.' });
      }
    } else {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  } catch (error: any) {
    console.error('Unified settings handler outermost failure:', error);
    return res.status(500).json({ error: error.message || 'Server error occurred in settings API.' });
  }
}
