import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize Firebase Admin SDK safely
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
      console.error('Error parsing FIREBASE_CONFIG env in estimates send handler:', error);
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
  // CORS Setup
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Both body and params can contain estimateId for routing compatibility
    const estimateId = req.body.estimateId || req.query.estimateId || (req.params && req.params.estimateId);
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

    // Try finding settings matching owner ID of the estimate
    const ownerUid = estimateData.userId || estimateData.uid || estimateData.ownerId;
    let settingsData: any = null;
    if (ownerUid) {
      try {
        const settingsSnap = await db.collection('companySettings').doc(ownerUid).get();
        if (settingsSnap.exists) {
          settingsData = settingsSnap.data();
          console.log(`[SMTP TENANT LOG] Loaded SMTP settings for tenant user '${ownerUid}'`);
        }
      } catch (err) {
        console.warn('Failed to fetch companySettings for ownerUid in email send handler:', err);
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

    // Strict instructions logging configuration presence (never logging passwords value)
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

    // Force secure: true (SSL/TLS) for port 465, or if selected as such
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
      socketTimeout: 15000
    };

    if (isPort465) {
      transporterConfig.tls = {
        rejectUnauthorized: false
      };
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
              ${resolvedCompanyLogo ? `<img src="${resolvedCompanyLogo}" alt="${resolvedFromName} Logo" style="max-height: 50px; display: block; margin: 0 auto 10px auto;" />` : ''}
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
      
      // Detailed logging for platform analytics and high-level client insights
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

  } catch (error: any) {
    console.error('[SERVERLESS OUTER ERROR]:', error);
    return res.status(500).json({ error: error.message || 'Internal server error in send handler.' });
  }
}
