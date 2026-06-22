import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

const CUSTOM_DB_ID = 'ai-studio-326159a1-d34a-4219-9e8c-edc19a926edb';

// Initialize the Firebase Admin SDK safely (idempotent across multiple routing entries)
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
      console.error('Error parsing FIREBASE_CONFIG env in email library:', error);
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

export interface SendAppEmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  cc?: string | string[];
  bcc?: string | string[];
  metadata?: any;
  category?: string;
  estimateData?: any;
  decoded?: any;
  estimateId?: string;
  customerId?: string;
  customSettingsData?: any;
}

export function parseEmailList(emailInput: string | string[] | undefined): string[] | undefined {
  if (!emailInput) return undefined;
  if (Array.isArray(emailInput)) return emailInput.map(e => e.trim());
  return emailInput.split(',').map(e => e.trim()).filter(Boolean);
}

export async function sendAppEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  cc,
  bcc,
  metadata,
  category,
  estimateData,
  decoded,
  estimateId,
  customerId,
  customSettingsData
}: SendAppEmailParams) {
  let resolvedSmtpHost = process.env.SMTP_HOST || 'mail.b.hostedemail.com';
  let resolvedSmtpPort = Number(process.env.SMTP_PORT) || 465;
  let resolvedSmtpSecureType = 'SSL/TLS';
  let resolvedSmtpUser = process.env.SMTP_USER;
  let resolvedSmtpPass = process.env.SMTP_PASS;
  let resolvedFromName = 'Lone Star Fence Works';
  let resolvedFromEmail = process.env.FROM_EMAIL || resolvedSmtpUser || 'estimates@send.lonestarfenceworks.com';
  let resolvedReplyToEmail = '';

  // Default configurations and options
  let emailProvider = 'resend'; // Default to Resend
  let resendApiKey = process.env.RESEND_API_KEY || '';
  let adminNotificationEmail = 'bradens@lonestarfenceworks.com';
  let sendCopyBccToAdmin = true;

  const ownerUid = estimateData?.userId || estimateData?.uid || estimateData?.ownerId;
  const candidateUids = [];
  if (decoded && decoded.uid) candidateUids.push(decoded.uid);
  if (ownerUid && !candidateUids.includes(ownerUid)) candidateUids.push(ownerUid);
  candidateUids.push('braden-lonestar-uid');
  candidateUids.push('main');

  let settingsData: any = null;
  if (customSettingsData) {
    settingsData = customSettingsData;
  } else {
    for (const uidToTry of candidateUids) {
      try {
        const settingsSnap = await db.collection('companySettings').doc(uidToTry).get();
        if (settingsSnap.exists) {
          settingsData = settingsSnap.data() || {};
          break; // break on the first configuration found
        }
      } catch (err) {
        console.warn(`Failed to fetch companySettings for candidate '${uidToTry}' in sendAppEmail:`, err);
      }
    }
  }

  if (settingsData) {
    if (settingsData.emailProvider) emailProvider = settingsData.emailProvider;
    if (settingsData.resendApiKey) resendApiKey = settingsData.resendApiKey;
    if (settingsData.smtpHost) resolvedSmtpHost = settingsData.smtpHost;
    if (settingsData.smtpPort) resolvedSmtpPort = Number(settingsData.smtpPort);
    if (settingsData.smtpSecureType) resolvedSmtpSecureType = settingsData.smtpSecureType;
    if (settingsData.smtpUsername) resolvedSmtpUser = settingsData.smtpUsername;
    if (settingsData.smtpPassword) resolvedSmtpPass = settingsData.smtpPassword;
    if (settingsData.fromName) resolvedFromName = settingsData.fromName;
    if (settingsData.fromEmail) resolvedFromEmail = settingsData.fromEmail;
    if (settingsData.adminNotificationEmail) adminNotificationEmail = settingsData.adminNotificationEmail;
    if (settingsData.sendCopyBccToAdmin !== undefined) sendCopyBccToAdmin = settingsData.sendCopyBccToAdmin;
  }

  // Determine if a Reply-To is explicitly configured
  let isReplyToConfigured = false;
  let finalReplyTo = '';

  // Helper checking of default, placeholder, or system-sending options for Lone Star
  const isExcludedReplyTo = (email: string | undefined): boolean => {
    if (!email) return true;
    const clean = email.trim().toLowerCase();
    return (
      clean === 'estimates@send.lonestarfenceworks.com' ||
      clean.endsWith('@send.lonestarfenceworks.com') ||
      clean === 'office@yourcompany.com' ||
      clean === resolvedFromEmail.toLowerCase()
    );
  };

  // 1. Check if we have explicitly configured database settings
  if (settingsData && settingsData.replyToEmail && settingsData.replyToEmail.trim()) {
    const dbReply = settingsData.replyToEmail.trim();
    if (!isExcludedReplyTo(dbReply)) {
      finalReplyTo = dbReply;
      isReplyToConfigured = true;
    }
  }

  // 2. Check if we have a non-default function argument
  if (!isReplyToConfigured && replyTo && replyTo.trim()) {
    const argReply = replyTo.trim();
    if (!isExcludedReplyTo(argReply)) {
      finalReplyTo = argReply;
      isReplyToConfigured = true;
    }
  }

  // 3. Apply the fallback order
  if (isReplyToConfigured && finalReplyTo) {
    resolvedReplyToEmail = finalReplyTo;
  } else if (adminNotificationEmail && adminNotificationEmail.trim() && !isExcludedReplyTo(adminNotificationEmail)) {
    resolvedReplyToEmail = adminNotificationEmail.trim();
  } else {
    // Ultimate fallback as from email
    resolvedReplyToEmail = resolvedFromEmail;
  }

  // Setup final BCCs
  let finalBccs: string[] = [];
  if (bcc) {
    const list = parseEmailList(bcc);
    if (list) finalBccs.push(...list);
  }
  if (sendCopyBccToAdmin && adminNotificationEmail) {
    const adminEmails = parseEmailList(adminNotificationEmail);
    if (adminEmails) {
      adminEmails.forEach(ae => {
        if (!finalBccs.includes(ae)) finalBccs.push(ae);
      });
    }
  }

  const estId = estimateId || estimateData?.id || estimateData?.estimateId || '';
  const custId = customerId || estimateData?.customerId || estimateData?.customer?.id || '';
  const activeProvider = (emailProvider === 'resend' && resendApiKey) ? 'resend' : 'smtp';

  console.log(`[sendAppEmail] Dispatching using active provider: ${activeProvider}`);

  let success = false;
  let activeError: string | null = null;
  let resendMessageId = '';
  let smtpInfo: any = null;

  if (activeProvider === 'resend') {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
          to: parseEmailList(to),
          reply_to: parseEmailList(resolvedReplyToEmail),
          subject,
          html,
          text: text || html.replace(/<[^>]*>/g, ''),
          bcc: finalBccs.length > 0 ? finalBccs : undefined,
          cc: cc ? parseEmailList(cc) : undefined
        })
      });

      if (!resendRes.ok) {
        const errBody = await resendRes.text();
        throw new Error(`Resend API returned status ${resendRes.status}: ${errBody}`);
      }

      const resendData = await resendRes.json();
      resendMessageId = resendData.id || '';
      success = true;
    } catch (err: any) {
      activeError = `Resend email failed: ${err.message || String(err)}`;
      console.error('[sendAppEmail Resend Error]', err);
    }
  } else {
    // Falls back to SMTP
    const missingVars: string[] = [];
    if (!resolvedSmtpHost) missingVars.push('SMTP_HOST');
    if (!resolvedSmtpUser) missingVars.push('SMTP_USER');
    if (!resolvedSmtpPass) missingVars.push('SMTP_PASS');

    if (missingVars.length > 0) {
      activeError = `Missing SMTP configurations: [${missingVars.join(', ')}]`;
    } else {
      const isPort465 = resolvedSmtpPort === 465 || resolvedSmtpSecureType === 'SSL/TLS';
      const transporterConfig = {
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

      try {
        const transporter = nodemailer.createTransport(transporterConfig);
        smtpInfo = await transporter.sendMail({
          from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
          to,
          replyTo: resolvedReplyToEmail,
          bcc: finalBccs.length > 0 ? finalBccs.join(', ') : undefined,
          cc: cc ? (typeof cc === 'string' ? cc : cc.join(', ')) : undefined,
          subject,
          text,
          html
        });
        success = true;
      } catch (err: any) {
        activeError = `SMTP email failed: ${err.message || String(err)}`;
        console.error('[sendAppEmail SMTP Error]', err);
      }
    }
  }

  // Define logging entry
  const logEntry = {
    provider: activeProvider,
    category: category || 'unknown',
    to,
    from: `"${resolvedFromName}" <${resolvedFromEmail}>`,
    replyTo: resolvedReplyToEmail || '',
    bcc: finalBccs.length > 0 ? finalBccs.join(', ') : '',
    subject,
    sentAt: new Date().toISOString(),
    resendMessageId: resendMessageId || '',
    success,
    error: activeError,
    estimateId: estId || '',
    customerId: custId || ''
  };

  // 1. Write standalone log entry in root collection emailLogs
  try {
    await db.collection('emailLogs').add(logEntry);
  } catch (ignoreLogErr) {
    console.warn("Could not write email log to root collection:", ignoreLogErr);
  }

  // 2. Append log to estimate document if estimateId resolves
  if (estId) {
    try {
      await db.collection('estimates').doc(String(estId)).update({
        emailLogs: admin.firestore.FieldValue.arrayUnion(logEntry)
      });
    } catch (ignoreEstLogErr) {
      console.warn(`Could not append email log to estimate ${estId}:`, ignoreEstLogErr);
    }
  }

  // 3. Append log to customer document if customerId resolves
  if (custId) {
    try {
      await db.collection('customers').doc(String(custId)).update({
        emailLogs: admin.firestore.FieldValue.arrayUnion(logEntry)
      });
    } catch (ignoreCustLogErr) {
      console.warn(`Could not append email log to customer ${custId}:`, ignoreCustLogErr);
    }
  }

  // Throw if there is an error to satisfy test expectations
  if (!success) {
    throw new Error(activeError || 'Failed to dispatch email.');
  }

  // Formulate mock info compatibility object
  const info = smtpInfo || {
    messageId: resendMessageId,
    accepted: parseEmailList(to),
    response: 'api::resend::ok',
    envelope: { from: resolvedFromEmail, to: parseEmailList(to) }
  };

  return {
    success: true,
    provider: activeProvider,
    resendMessageId,
    info,
    resolvedFromName,
    resolvedFromEmail,
    resolvedReplyToEmail
  };
}
