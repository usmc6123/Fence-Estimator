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

    const defaultSubject = `Fence Installation Contract Agreement - Lone Star Fence Works`;
    const defaultMessage = `Hello ${customerName},\n\nWe have generated your custom fencing contract agreement estimate. Please review and sign the agreement directly on your device using the link below:\n\n${estimateLink}\n\nThank you for choosing Lone Star Fence Works!\n\nBest regards,\nLone Star Fence Works Estimations Department`;

    const mailSubject = subject || defaultSubject;
    const mailMessage = message || defaultMessage;

    // SMTP Credential checks. Prioritize mail.b.hostedemail.com
    const smtpHost = process.env.SMTP_HOST || 'mail.b.hostedemail.com';
    const smtpPort = Number(process.env.SMTP_PORT) || 465;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromEmailEnv = process.env.FROM_EMAIL || smtpUser || 'BradenS@LoneStarFenceWorks.com';
    const fromEmail = senderEmail || fromEmailEnv;

    // Strict instructions logging configuration presence (never logging passwords value)
    console.log(`[SMTP SERVERLESS COMPLIANCE CHECK]`);
    console.log(`- SMTP_HOST is present: ${!!smtpHost} (${smtpHost})`);
    console.log(`- SMTP_PORT is present: ${!!process.env.SMTP_PORT} (${smtpPort})`);
    console.log(`- SMTP_USER is present: ${!!smtpUser} (${smtpUser || 'Not Configured'})`);
    console.log(`- FROM_EMAIL is present: ${!!process.env.FROM_EMAIL} (${process.env.FROM_EMAIL || 'Not Configured'})`);
    console.log(`- SMTP_PASS is present: ${!!smtpPass}`);
    console.log(`- Resolved sending from address: '${fromEmail}'`);

    const missingVars: string[] = [];
    if (!smtpHost) missingVars.push('SMTP_HOST');
    if (!smtpUser) missingVars.push('SMTP_USER');
    if (!smtpPass) missingVars.push('SMTP_PASS');

    if (missingVars.length > 0) {
      return res.status(500).json({
        success: false,
        error: `Missing SMTP environment configurations: [${missingVars.join(', ')}]`,
        errorType: 'MISSING_ENVIRONMENT_VARIABLE'
      });
    }

    // Force secure: true (SSL/TLS) for port 465, not opportunistic STARTTLS upgrade
    const isPort465 = smtpPort === 465;

    const transporterConfig: any = {
      host: smtpHost,
      port: smtpPort,
      secure: isPort465, // Use SSL/TLS on port 465 with secure: true, not STARTTLS
      auth: {
        user: smtpUser,
        pass: smtpPass
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000
    };

    if (isPort465) {
      transporterConfig.tls = {
        rejectUnauthorized: false
      };
      console.log(`[SMTP SERVERLESS SECURITY] Direct SSL/TLS session forced on port 465 (secure: true).`);
    } else {
      console.log(`[SMTP SERVERLESS SECURITY] Standard STARTTLS session configured on port ${smtpPort}.`);
    }

    let mailSent = false;
    let mailError = null;
    let errorType = 'UNKNOWN';

    try {
      const transporter = nodemailer.createTransport(transporterConfig);
      await transporter.sendMail({
        from: `"Lone Star Fence Works" <${fromEmail}>`,
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
              <p style="color: #4a5568; line-height: 1.6; font-size: 14px;">Dear ${customerName},</p>
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
      console.log(`Email successfully routed in serverless handler to ${customerEmail}`);
    } catch (err: any) {
      const errorMessage = err.message || String(err);
      const errCode = err.code || '';
      
      // Detailed logging for platform analytics and high-level client insights
      console.error(`[SERVERLESS SMTP TRACE] Failure sending mail:`, err);
      
      if (errCode === 'EAUTH' || errorMessage.toLowerCase().includes('auth') || err.responseCode === 535) {
        errorType = 'AUTHENTICATION_ERROR';
        mailError = `SMTP Authentication rejected. Verify SMTP_USER and SMTP_PASS. [${errorMessage}]`;
      } else if (errCode === 'ECONNREFUSED' || errCode === 'ETIMEOUT' || errCode === 'ENOTFOUND' || errorMessage.toLowerCase().includes('connect')) {
        errorType = 'CONNECTION_ERROR';
        mailError = `Unable to connect to SMTP server at ${smtpHost}:${smtpPort}. [${errorMessage}]`;
      } else if (errorMessage.toLowerCase().includes('tls') || errorMessage.toLowerCase().includes('ssl') || errCode === 'ESOCKET') {
        errorType = 'TLS_SSL_ERROR';
        mailError = `SSL/TLS protocol negotiation failure. Port 465 requires secure: true direct connection. [${errorMessage}]`;
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
        senderEmail: fromEmail,
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
