import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { sendGhlWebhook } from '../webhooks/ghl';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

const JWT_SECRET = process.env.JWT_SECRET || 'lone-star-fence-secret';
const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK
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
      console.error('Error parsing FIREBASE_CONFIG env in estimates write:', error);
      admin.initializeApp({
        projectId: 'dazzling-card-485210-r8',
      });
    }
  } else {
    admin.initializeApp({
      projectId: 'dazzling-card-485210-r8',
    });
  }
}

const db = getFirestore(admin.app(), CUSTOM_DB_ID);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const action = req.query?.action || req.body?.action;

    // PUBLIC CUSTOMER PORTAL GUEST ENDPOINTS: Bypass authentication completely!
    if (action === 'get-public-estimate') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }

      const docRef = db.collection('estimates').doc(String(estimateId));
      let snap = await docRef.get();

      let estimateData: any = null;
      if (snap.exists) {
        estimateData = { id: snap.id, ...snap.data() };
      } else {
        // Look up nested
        const usersSnap = await db.collection('users').get();
        for (const uDoc of usersSnap.docs) {
          const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
          const nestedSnap = await nestedRef.get();
          if (nestedSnap.exists) {
            estimateData = { id: nestedSnap.id, ...nestedSnap.data() };
            break;
          }
        }
      }

      if (!estimateData) {
        return res.status(404).json({ error: 'Estimate not found in database.' });
      }

      const ownerUid = estimateData.userId || estimateData.uid || estimateData.ownerId;
      let companyConfig: any = null;
      if (ownerUid) {
        try {
          const settingsSnap = await db.collection('companySettings').doc(ownerUid).get();
          if (settingsSnap.exists) {
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

      return res.status(200).json({
        ...estimateData,
        settings: companyConfig
      });
    }

    if (action === 'view-public-estimate') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }

      let targetRef = db.collection('estimates').doc(String(estimateId));
      let snap = await targetRef.get();

      if (!snap.exists) {
        const usersSnap = await db.collection('users').get();
        for (const uDoc of usersSnap.docs) {
          const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
          const nestedSnap = await nestedRef.get();
          if (nestedSnap.exists) {
            targetRef = nestedRef;
            snap = nestedSnap;
            break;
          }
        }
      }

      if (!snap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const docData = snap.data() || {};
      const now = new Date().toISOString();
      const updates: any = {
        customerOpenedAt: docData.customerOpenedAt || now,
        customerViewedAt: now,
        customerOpenedIp: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim(),
        viewCount: (docData.viewCount || 0) + 1
      };

      await targetRef.update(updates);
      return res.status(200).json({ success: true, tracking: updates });
    }

    if (action === 'decision-public-estimate') {
      const estimateId = req.query?.estimateId || req.body?.estimateId;
      const { decision, signature, declineReason, customerEmail } = req.body || {};

      if (!estimateId) {
        return res.status(400).json({ error: 'Estimate ID is required.' });
      }
      if (!decision || !['accepted', 'declined'].includes(decision)) {
        return res.status(400).json({ error: 'Invalid decision parameter. Must be "accepted" or "declined".' });
      }

      let targetRef = db.collection('estimates').doc(String(estimateId));
      let snap = await targetRef.get();

      if (!snap.exists) {
        const usersSnap = await db.collection('users').get();
        for (const uDoc of usersSnap.docs) {
          const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
          const nestedSnap = await nestedRef.get();
          if (nestedSnap.exists) {
            targetRef = nestedRef;
            snap = nestedSnap;
            break;
          }
        }
      }

      if (!snap.exists) {
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
        updates.customerEmailSigned = customerEmail || '';
        updates.customerSignedDate = now;
        updates.acceptedAt = now;
        updates.jobStatus = 'Approved';
      } else {
        updates.customerDeclineReason = declineReason || 'Not specified';
        updates.customerEmailSigned = customerEmail || '';
        updates.jobStatus = 'Declined';
      }

      const data = snap.data() || {};
      const ownerUid = data.userId || data.uid || data.ownerId;

      let customAcceptedMessage = 'Estimate accepted successfully! We will finalize your installation timeframe shortly.';
      let customDeclinedMessage = 'Estimate declined. We will reach out to understand your feedback. Thank you!';
      let webhookUrl = '';

      if (ownerUid) {
        try {
          const settingsSnap = await db.collection('companySettings').doc(ownerUid).get();
          if (settingsSnap.exists) {
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
            customerEmail: data.customerEmail || customerEmail || '',
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

      // Dispatch new custom event-based GHL webhooks asynchronously
      const eventType = decision === 'accepted' ? 'estimate_accepted' : 'estimate_declined';
      const eventPayload = {
        customerName: data.customerName || '',
        email: data.customerEmail || customerEmail || data.email || '',
        phone: data.customerPhone || data.phone || '',
        address: data.customerAddress || data.address || '',
        fenceType: data.fenceType || (data.materials?.[0]?.fenceStyle) || 'Wood Fence',
        linearFeet: Number(data.linearFeet || (data.materials?.[0]?.linearFeet) || data.manualLinearFeet || 0),
        estimatedPrice: Number(data.totalCost || data.manualGrandTotal || 0),
        estimateNumber: data.estimateNumber || '',
        customerSignature: signature || 'Digitally Signed',
        customerSignedDate: now,
        acceptedAt: now,
        declinedAt: now,
        declineReason: declineReason || 'Not specified'
      };

      sendGhlWebhook(eventType, String(estimateId), eventPayload, db, ownerUid).catch(err => {
        console.error(`Triggering ${eventType} webhook failed:`, err);
      });

      await targetRef.update(updates);
      console.log(`Estimate ${estimateId} public decision recorded:`, updates);
      return res.status(200).json({ success: true, decision: updates });
    }

    const authHeader = req.headers.authorization;
    let decoded: any = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (err: any) {
        console.warn('JWT verification failed in estimates write:', err.message);
      }
    }

    // Public customer submissions have no token — scope them to Braden's UID automatically
    if (!decoded || !decoded.uid) {
      decoded = { uid: 'braden-lonestar-uid', isAdmin: false };
    }

    const decodedEmail = decoded.email?.toLowerCase();
    const isWriteAdmin = decoded.isAdmin || 
                         decoded.uid === 'braden-lonestar-uid' || 
                         decodedEmail === 'bradens@lonestarfenceworks.com' || 
                         decodedEmail === 'usmc6123@gmail.com';

    // Determine the actual action (using standard method or a simulated one such as action params)
    const method = req.method;

    // GET Handler
    if (method === 'GET') {
      const action = req.query.action || (req.body && req.body.action);
      if (action === 'list-schedule-events') {
        const eventsList: any[] = [];
        const snap = await db.collection('schedule_events').get();
        snap.forEach(doc => {
          eventsList.push({ id: doc.id, ...doc.data() });
        });
        
        const filtered = eventsList.filter(e => 
          e.userId === decoded.uid || 
          decoded.uid === 'braden-lonestar-uid'
        );
        return res.status(200).json(filtered);
      }
      if (action === 'debug-smtp-logs') {
        const settingsList: any[] = [];
        try {
          const settingsSnap = await db.collection('companySettings').get();
          settingsSnap.forEach(doc => {
            const data = doc.data();
            settingsList.push({
              id: doc.id,
              smtpHost: data.smtpHost,
              smtpPort: data.smtpPort,
              smtpSecureType: data.smtpSecureType,
              smtpUsername: data.smtpUsername,
              fromEmail: data.fromEmail,
              fromName: data.fromName,
              hasPassword: !!data.smtpPassword,
              passwordLength: data.smtpPassword ? data.smtpPassword.length : 0,
              passwordPreview: data.smtpPassword ? `${data.smtpPassword.substring(0, 2)}...${data.smtpPassword.substring(Math.max(0, data.smtpPassword.length - 2))}` : ''
            });
          });
        } catch (err: any) {
          console.error('Failed to load companySettings in debug:', err);
        }

        const estimateLogsList: any[] = [];
        let allEstimatesCount = 0;
        let allUsersCount = 0;
        let allSettingsCount = 0;
        try {
          const estimatesSnap = await db.collection('estimates').get();
          allEstimatesCount = estimatesSnap.size;
          estimatesSnap.forEach(doc => {
            const data = doc.data();
            estimateLogsList.push({
              id: doc.id,
              customerName: data.customerName,
              customerEmail: data.customerEmail,
              customerEmailSent: data.customerEmailSent || null,
              customerSentAt: data.customerSentAt || null,
              customerEmailLog: data.customerEmailLog || null,
              keys: Object.keys(data)
            });
          });

          const usersSnap = await db.collection('users').get();
          allUsersCount = usersSnap.size;
          for (const userDoc of usersSnap.docs) {
            const nestedSnap = await db.collection('users').doc(userDoc.id).collection('estimates').get();
            nestedSnap.forEach(doc => {
              const data = doc.data();
              estimateLogsList.push({
                id: doc.id,
                userId: userDoc.id,
                customerName: data.customerName,
                customerEmail: data.customerEmail,
                customerEmailSent: data.customerEmailSent || null,
                customerSentAt: data.customerSentAt || null,
                customerEmailLog: data.customerEmailLog || null,
                keys: Object.keys(data)
              });
            });
          }
        } catch (err: any) {
          console.error('Failed to load estimates inside debug:', err);
        }

        return res.status(200).json({
          success: true,
          settingsList,
          estimateLogsList,
          allEstimatesCount,
          allUsersCount,
          envVariables: {
            SMTP_HOST: process.env.SMTP_HOST || 'not set',
            SMTP_PORT: process.env.SMTP_PORT || 'not set',
            SMTP_USER: process.env.SMTP_USER || 'not set',
            FROM_EMAIL: process.env.FROM_EMAIL || 'not set',
            hasSmtpPass: !!process.env.SMTP_PASS
          }
        });
      }
      return res.status(400).json({ error: 'Unsupported action for GET method' });
    }

    // Standard Routing
    if (method === 'POST') {
      if (req.body && req.body.action === 'schedule-event') {
        const { action, ...eventData } = req.body;
        const id = eventData.id;
        if (!id) {
          return res.status(400).json({ error: 'Event ID is required.' });
        }
        eventData.userId = eventData.userId || decoded.uid;
        await db.collection('schedule_events').doc(String(id)).set(eventData);
        return res.status(200).json(eventData);
      }
      if (req.body && req.body.action === 'send') {
        const estimateId = req.body.estimateId || req.query.estimateId;
        const { customerEmail, senderEmail, subject, message } = req.body;

        if (!estimateId) {
          return res.status(400).json({ error: 'Estimate ID is required.' });
        }

        if (!customerEmail) {
          return res.status(400).json({ error: 'Customer email is required.' });
        }

        // 1. Fetch estimate from firestore using Admin SDK
        const estimateRef = db.collection('estimates').doc(String(estimateId));
        let snap = await estimateRef.get();
        let targetRef = estimateRef;

        if (!snap.exists) {
          // Seek nested user folder path
          const usersSnap = await db.collection('users').get();
          for (const uDoc of usersSnap.docs) {
            const nestedRef = db.collection('users').doc(uDoc.id).collection('estimates').doc(String(estimateId));
            const nestedSnap = await nestedRef.get();
            if (nestedSnap.exists) {
              targetRef = nestedRef;
              snap = nestedSnap;
              break;
            }
          }
        }

        if (!snap.exists) {
          return res.status(404).json({ error: 'Estimate not found in database.' });
        }

        const estimateData = snap.data() || {};
        const customerName = estimateData.customerName || 'Valued Customer';

        // 2. Setup access link based on hosting context
        const host = req.headers.host || 'localhost:3000';
        const protocol = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http';
        const estimateLink = `${protocol}://${host}/?portal=contract&estimateId=${estimateId}`;

        // Resolve user's Saved SMTP and Company settings
        let resolvedSmtpHost = process.env.SMTP_HOST || 'mail.b.hostedemail.com';
        let resolvedSmtpPort = Number(process.env.SMTP_PORT) || 465;
        let resolvedSmtpSecureType = 'SSL/TLS';
        let resolvedSmtpUser = process.env.SMTP_USER;
        let resolvedSmtpPass = process.env.SMTP_PASS;
        let resolvedFromName = 'Lone Star Fence Works';
        let resolvedFromEmail = process.env.FROM_EMAIL || resolvedSmtpUser || 'BradenS@LoneStarFenceWorks.com';
        let resolvedReplyToEmail = resolvedFromEmail;
        let resolvedCompanyLogo = '';
        let resolvedCompanyPhone = '';
        let resolvedCompanyWebsite = '';
        
        // Default estimate templates:
        let mailSubject = subject || `Fence Installation Contract Agreement - Lone Star Fence Works`;
        let mailMessage = message || `Hello {customerName},\n\nWe have generated your custom fencing contract agreement estimate. Please review and sign the agreement directly on your device using the link below:\n\n{estimateLink}\n\nThank you for choosing {companyName}!\n\nBest regards,\n{companyName} Estimations Department`;

        // Try finding settings matching owner ID or dynamic candidate sequence:
        const ownerUid = estimateData.userId || estimateData.uid || estimateData.ownerId;
        const candidateUids = [];
        if (decoded && decoded.uid) candidateUids.push(decoded.uid);
        if (ownerUid && !candidateUids.includes(ownerUid)) candidateUids.push(ownerUid);
        candidateUids.push('main');

        let settingsData: any = null;
        for (const uidToTry of candidateUids) {
          try {
            const settingsSnap = await db.collection('companySettings').doc(uidToTry).get();
            if (settingsSnap.exists) {
              const possibleSettings = settingsSnap.data() || {};
              // Verify they actually configured custom SMTP credentials here
              if (possibleSettings.smtpHost && possibleSettings.smtpUsername) {
                settingsData = possibleSettings;
                console.log(`[SMTP TENANT LOG] Loaded active SMTP settings from candidate '${uidToTry}'`);
                break;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch companySettings for candidate '${uidToTry}' in email send handler:`, err);
          }
        }

        if (settingsData) {
          if (settingsData.smtpHost) resolvedSmtpHost = settingsData.smtpHost;
          if (settingsData.smtpPort) resolvedSmtpPort = Number(settingsData.smtpPort);
          if (settingsData.smtpSecureType) resolvedSmtpSecureType = settingsData.smtpSecureType;
          if (settingsData.smtpUsername) resolvedSmtpUser = settingsData.smtpUsername;
          if (settingsData.smtpPassword) resolvedSmtpPass = settingsData.smtpPassword;
          if (settingsData.fromName) resolvedFromName = settingsData.fromName;
          if (settingsData.fromEmail) resolvedFromEmail = settingsData.fromEmail;
          resolvedReplyToEmail = settingsData.replyToEmail || resolvedFromEmail;
          resolvedCompanyLogo = settingsData.companyLogo || '';
          resolvedCompanyPhone = settingsData.companyPhone || '';
          resolvedCompanyWebsite = settingsData.companyWebsite || '';

          // Set customized templates if not overridden by dynamic subject/message
          if (!subject && settingsData.estimateEmailSubject) {
            mailSubject = settingsData.estimateEmailSubject;
          }
          if (!message && settingsData.estimateEmailBody) {
            mailMessage = settingsData.estimateEmailBody;
          }
        }

        // Replace placeholding variables inside templates
        const replacePlaceholders = (text: string) => {
          if (!text) return '';
          return text
            .replace(/{customerName}/g, customerName)
            .replace(/{customerEmail}/g, customerEmail)
            .replace(/{estimateNumber}/g, estimateData.estimateNumber || estimateId)
            .replace(/{estimateLink}/g, estimateLink)
            .replace(/{companyName}/g, resolvedFromName)
            .replace(/{companyPhone}/g, resolvedCompanyPhone || '')
            .replace(/{companyWebsite}/g, resolvedCompanyWebsite || '');
        };

        mailSubject = replacePlaceholders(mailSubject);
        mailMessage = replacePlaceholders(mailMessage);

        console.log(`[SMTP SERVERLESS COMPLIANCE CHECK - MULTI-TENANT]`);
        console.log(`- SMTP_HOST is present: ${!!resolvedSmtpHost} (${resolvedSmtpHost})`);
        console.log(`- SMTP_PORT is present: ${!!resolvedSmtpPort} (${resolvedSmtpPort})`);
        console.log(`- SMTP_USER is present: ${!!resolvedSmtpUser} (${resolvedSmtpUser || 'Not Configured'})`);
        console.log(`- FROM_EMAIL is present: ${!!resolvedFromEmail} (${resolvedFromEmail || 'Not Configured'})`);
        console.log(`- SMTP_PASS is present: ${!!resolvedSmtpPass}`);
        console.log(`- Resolved sending from address: '${resolvedFromEmail}'`);

        const missingVars: string[] = [];
        if (!resolvedSmtpHost) missingVars.push('SMTP_HOST');
        if (!resolvedSmtpUser) missingVars.push('SMTP_USER');
        if (!resolvedSmtpPass) missingVars.push('SMTP_PASS');

        if (missingVars.length > 0) {
          return res.status(500).json({
            success: false,
            error: `Missing SMTP environment or saved settings configurations: [${missingVars.join(', ')}]`,
            errorType: 'MISSING_ENVIRONMENT_VARIABLE'
          });
        }

        const isPort465 = resolvedSmtpPort === 465 || resolvedSmtpSecureType === 'SSL/TLS';

        const transporterConfig: any = {
          host: resolvedSmtpHost,
          port: resolvedSmtpPort,
          secure: isPort465,
          auth: {
            user: resolvedSmtpUser,
            pass: resolvedSmtpPass
          },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 15000,
          tls: {
            rejectUnauthorized: false
          }
        };

        if (isPort465) {
          console.log(`[SMTP SERVERLESS SECURITY] Direct SSL/TLS session configured on port ${resolvedSmtpPort} (secure: true).`);
        } else {
          console.log(`[SMTP SERVERLESS SECURITY] Standard STARTTLS session configured on port ${resolvedSmtpPort}.`);
        }

        let mailSent = false;
        let mailError = null;
        let errorType = 'UNKNOWN';

        try {
          const transporter = nodemailer.createTransport(transporterConfig);
          await transporter.sendMail({
            from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
            to: customerEmail,
            replyTo: resolvedReplyToEmail,
            subject: mailSubject,
            text: mailMessage,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="background-color: #0c1a30; padding: 24px; text-align: center; border-bottom: 4px solid #b91c1c;">
                  ${resolvedCompanyLogo ? `<img src="${resolvedCompanyLogo}" alt="${resolvedFromName} Logo" style="max-height: 70px; max-width: 250px; width: auto !important; height: auto !important; display: block; margin: 0 auto 12px auto;" />` : ''}
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px;">${resolvedFromName}</h1>
                  <p style="color: #ef4444; margin: 6px 0 0 0; font-weight: bold; letter-spacing: 4px; font-size: 11px;">ESTIMATE PORTAL AGREEMENT</p>
                </div>
                <div style="padding: 32px 24px; background-color: #ffffff;">
                  <h2 style="color: #0c1a30; font-size: 18px; margin-top: 0;">Estimate Prepared for ${customerName}</h2>
                  <div style="color: #4a5568; line-height: 1.6; font-size: 14px; white-space: pre-wrap; margin-bottom: 24px;">
    ${mailMessage.replace(estimateLink, '')}
                  </div>
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${estimateLink}" style="background-color: #0c1a30; color: #ffffff; text-decoration: none; padding: 14px 28px; font-weight: bold; font-size: 14px; border-radius: 6px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; border-bottom: 3px solid #b91c1c;">
                      Review & Sign Contract Agreement
                    </a>
                  </div>
                  <p style="color: #718096; font-size: 12px; line-height: 1.5;">
                    If the button doesn't work, copy and paste the following URL into your browser's address bar:<br/>
                    <a href="${estimateLink}" style="color: #3182ce;">${estimateLink}</a>
                  </p>
                  <p style="color: #4a5568; margin-top: 24px; font-size: 14px; border-top: 1px solid #edf2f7; padding-top: 16px;">
                    Best regards,<br/>
                    <strong>${resolvedFromName}</strong><br/>
                    ${resolvedCompanyPhone ? `Phone: ${resolvedCompanyPhone}<br/>` : ''}
                    ${resolvedCompanyWebsite ? `<a href="${resolvedCompanyWebsite}" style="color: #3182ce; text-decoration: none;">${resolvedCompanyWebsite}</a>` : ''}
                  </p>
                </div>
                <div style="background-color: #f7fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #edf2f7;">
                  <p style="color: #a0aec0; font-size: 11px; margin: 0;">
                    ${resolvedFromName} &bull; Fencing Estimating Suite
                  </p>
                </div>
              </div>
            `
          });
          mailSent = true;
          console.log(`Email successfully routed in serverless handler to ${customerEmail}`);
        } catch (err: any) {
          const errorMessage = err.message || String(err);
          const errCode = err.code || '';
          
          console.error(`[SERVERLESS SMTP TRACE] Failure sending mail:`, err);
          
          if (errCode === 'EAUTH' || errorMessage.toLowerCase().includes('auth') || err.responseCode === 535) {
            errorType = 'AUTHENTICATION_ERROR';
            mailError = `SMTP Authentication rejected. Verify SMTP Username and Password. [${errorMessage}]`;
          } else if (errCode === 'ECONNREFUSED' || errCode === 'ETIMEOUT' || errCode === 'ENOTFOUND' || errorMessage.toLowerCase().includes('connect')) {
            errorType = 'CONNECTION_ERROR';
            mailError = `Unable to connect to SMTP server at ${resolvedSmtpHost}:${resolvedSmtpPort}. [${errorMessage}]`;
          } else if (errorMessage.toLowerCase().includes('tls') || errorMessage.toLowerCase().includes('ssl') || errCode === 'ESOCKET') {
            errorType = 'TLS_SSL_ERROR';
            mailError = `SSL/TLS protocol negotiation failure. Port 465 requires secure direct connection. [${errorMessage}]`;
          } else {
            errorType = 'SMTP_TRANSMISSION_ERROR';
            mailError = `SMTP dispatch error: ${errorMessage}`;
          }
        }

        // Record the status back in Firestore
        const now = new Date().toISOString();
        const existingLogs = estimateData.customerEmailLog || [];
        const updates: any = {
          customerEmailSent: mailSent,
          customerSentAt: mailSent ? now : (estimateData.customerSentAt || null),
          customerEmailLog: [...existingLogs, {
            sentAt: now,
            customerEmail,
            subject: mailSubject,
            senderEmail: resolvedFromEmail,
            mailSent,
            mailError,
            portalUrl: estimateLink
          }],
          updatedAt: now
        };

        if (mailSent) {
          updates.representativeSignatureName = "Braden Scott Smith";
          updates.representativeCompanyName = "Lone Star Fence Works";
          updates.representativeSignedDate = now;
          updates.customerEmailSentAt = now;
          updates.jobStatus = 'Estimate Sent';

          // Trigger manual_estimate_sent GHL webhook asynchronously
          const manualPayload = {
            customerName: estimateData.customerName || '',
            firstName: estimateData.customerFirstName || '',
            lastName: estimateData.customerLastName || '',
            email: customerEmail || estimateData.customerEmail || '',
            phone: estimateData.customerPhone || '',
            address: estimateData.customerAddress || estimateData.customerStreet || '',
            city: estimateData.customerCity || '',
            state: estimateData.customerState || '',
            zip: estimateData.customerZip || '',
            fenceType: estimateData.fenceType || (estimateData.materials?.[0]?.fenceStyle) || 'Wood Fence',
            linearFeet: Number(estimateData.linearFeet || (estimateData.materials?.[0]?.linearFeet) || estimateData.manualLinearFeet || 0),
            estimatedPrice: Number(estimateData.totalCost || estimateData.manualGrandTotal || 0),
            estimateNumber: estimateData.estimateNumber || '',
            estimateLink: estimateLink,
            sentAt: now
          };
          sendGhlWebhook('manual_estimate_sent', String(estimateId), manualPayload, db, ownerUid).catch(err => {
            console.error('Triggering manual_estimate_sent webhook failed:', err);
          });
        }

        await targetRef.set(updates, { merge: true });

        if (!mailSent) {
          return res.status(500).json({
            success: false,
            error: mailError || 'Failed to send email via SMTP.',
            errorType
          });
        }

        return res.status(200).json({
          success: true,
          mailSent,
          portalUrl: estimateLink,
          sentAt: now
        });
      }

      // POST logic matches old api/estimates/save.ts
      const estimateData = { ...req.body };
      const estimateId = estimateData.id;

      // Remove ID before saving
      delete estimateData.id;

      // Always set ownership fields from JWT token, never request body
      estimateData.uid = decoded.uid;
      estimateData.userId = decoded.uid;
      estimateData.companyId = 'lonestarfence';

      const nowIso = new Date().toISOString();
      estimateData.lastModified = nowIso;
      if (!estimateData.createdAt) {
        estimateData.createdAt = nowIso;
      }
      if (!estimateData.status) {
        estimateData.status = 'active';
      }

      let savedId = estimateId;

      if (savedId) {
        const docRef = db.collection('estimates').doc(String(savedId));
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const existingData = docSnap.data() || {};
          if (
            existingData.uid !== decoded.uid &&
            existingData.userId !== decoded.uid &&
            !isWriteAdmin
          ) {
            return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
          }
          await docRef.set(estimateData, { merge: true });
        } else {
          await docRef.set(estimateData);
        }
      } else {
        const docRef = await db.collection('estimates').add(estimateData);
        savedId = docRef.id;
      }

      return res.status(200).json({
        id: savedId,
        ...estimateData
      });

    } else if (method === 'PUT') {
      if (req.body && req.body.action === 'update-schedule-event') {
        const { action, id, ...updates } = req.body;
        if (!id) {
          return res.status(400).json({ error: 'Event ID is required.' });
        }
        await db.collection('schedule_events').doc(String(id)).update(updates);
        return res.status(200).json({ id, ...updates });
      }

      // PUT logic matches old api/estimates/update.ts
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Missing required field: id' });
      }

      const docRef = db.collection('estimates').doc(String(id));
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const existingData = docSnap.data() || {};
      if (
        existingData.uid !== decoded.uid &&
        existingData.userId !== decoded.uid &&
        !isWriteAdmin
      ) {
        return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
      }

      // Set lastModified in updates
      const nowIso = new Date().toISOString();
      updates.lastModified = nowIso;

      // Do not permit client modification of user ownership parameters
      delete updates.uid;
      delete updates.userId;
      delete updates.companyId;

      const previousStatus = existingData.jobStatus;
      const newStatus = updates.jobStatus;

      await docRef.update(updates);

      // Trigger webhooks for job status transitions handled by PUT
      if (newStatus && newStatus !== previousStatus) {
        const eventPayload = {
          customerName: existingData.customerName || '',
          email: existingData.customerEmail || '',
          phone: existingData.customerPhone || '',
          address: existingData.customerAddress || '',
          fenceType: existingData.fenceType || (existingData.materials?.[0]?.fenceStyle) || 'Wood Fence',
          linearFeet: Number(existingData.linearFeet || (existingData.materials?.[0]?.linearFeet) || existingData.manualLinearFeet || 0),
          estimatedPrice: Number(existingData.totalCost || existingData.manualGrandTotal || 0),
          finalPrice: Number(updates.finalPrice || existingData.totalCost || existingData.manualGrandTotal || 0),
          estimateNumber: existingData.estimateNumber || '',
          customerSignature: existingData.customerSignature || 'Digitally Signed',
          customerSignedDate: existingData.customerDecisionDate || nowIso,
          acceptedAt: existingData.customerDecisionDate || nowIso,
          declinedAt: existingData.customerDecisionDate || nowIso,
          declineReason: existingData.customerDeclineReason || 'Not specified'
        };

        const ownerUid = existingData.userId || existingData.uid || existingData.ownerId || (decoded && decoded.uid);

        if (newStatus === 'Completed') {
          sendGhlWebhook('estimate_completed', String(id), eventPayload, db, ownerUid).catch(err => {
            console.error('Triggering estimate_completed webhook failed:', err);
          });
        } else if (newStatus === 'Accepted') {
          sendGhlWebhook('estimate_accepted', String(id), eventPayload, db, ownerUid).catch(err => {
            console.error('Triggering estimate_accepted webhook failed:', err);
          });
        } else if (newStatus === 'Declined') {
          sendGhlWebhook('estimate_declined', String(id), eventPayload, db, ownerUid).catch(err => {
            console.error('Triggering estimate_declined webhook failed:', err);
          });
        }
      }

      return res.status(200).json({
        id,
        ...existingData,
        ...updates
      });

    } else if (method === 'DELETE') {
      const action = req.body?.action || req.query?.action;
      if (action === 'delete-schedule-event') {
        const id = req.body?.id || req.query?.id;
        if (!id) {
          return res.status(400).json({ error: 'Event ID is required.' });
        }
        await db.collection('schedule_events').doc(String(id)).delete();
        return res.status(200).json({ success: true });
      }

      // DELETE logic matches old api/estimates/delete.ts
      const estimateId = req.query.id || req.body.id;

      if (!estimateId) {
        return res.status(400).json({ error: 'Missing required field: id' });
      }

      const docRef = db.collection('estimates').doc(String(estimateId));
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: 'Estimate not found' });
      }

      const existingData = docSnap.data() || {};
      if (
        existingData.uid !== decoded.uid &&
        existingData.userId !== decoded.uid &&
        !isWriteAdmin
      ) {
        return res.status(403).json({ error: 'Forbidden: You do not own this estimate record' });
      }

      await docRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Estimate successfully deleted',
        id: estimateId
      });
    }

  } catch (error: any) {
    console.error('Error in estimate handler:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}
