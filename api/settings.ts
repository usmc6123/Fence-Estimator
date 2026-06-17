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
          ghlWebhookEstimateDeclined: '',
          ghlLocationId: '',
          ghlApiKey: '',
          ghlInboundWebhookSecret: '',
          ghlPrefillSources: ['customers', 'estimates', 'ghl'],
          ghlMinChars: 2,
          ghlMaxResults: 10
        });
      }

      const data = settingsDoc.data() || {};
      
      // Mask sensitive fields like smtpPassword and ghlApiKey for secure retrieval
      if (data.smtpPassword) {
        data.smtpPassword = '••••••••';
      }
      if (data.ghlApiKey) {
        data.ghlApiKey = '••••••••';
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
          ghlWebhookEstimateDeclined,
          ghlLocationId,
          ghlApiKey,
          ghlInboundWebhookSecret,
          ghlPrefillSources,
          ghlMinChars,
          ghlMaxResults
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

        let finalGhlApiKey = ghlApiKey;
        if (ghlApiKey === '••••••••' || !ghlApiKey) {
          if (existingData && existingData.ghlApiKey) {
            finalGhlApiKey = existingData.ghlApiKey;
          } else {
            finalGhlApiKey = '';
          }
        }

        const updatedSettings = {
          id: uid,
          companyName: companyName || '',
          companyEmail: companyEmail || '',
          companyPhone: companyPhone || '',
          companyWebsite: companyWebsite || '',
          companyLogo: companyLogo || '',
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
          ghlLocationId: ghlLocationId || '',
          ghlApiKey: finalGhlApiKey,
          ghlInboundWebhookSecret: ghlInboundWebhookSecret || '',
          ghlPrefillSources: ghlPrefillSources || ['customers', 'estimates', 'ghl'],
          ghlMinChars: ghlMinChars !== undefined ? Number(ghlMinChars) : 2,
          ghlMaxResults: ghlMaxResults !== undefined ? Number(ghlMaxResults) : 10,
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

        if (!smtpHost || !smtpPort || !smtpUsername) {
          return res.status(400).json({ error: 'SMTP host, SMTP port, and SMTP username are required.' });
        }

        if (!recipientEmail) {
          return res.status(400).json({ error: 'Recipient Email address is required to dispatch the test message.' });
        }

        // Resolve final password if masked is submitted
        let finalPassword = smtpPassword;
        if (smtpPassword === '••••••••' || !smtpPassword) {
          const settingsDocSnap = await db.collection('companySettings').doc(uid).get();
          if (settingsDocSnap.exists && settingsDocSnap.data()?.smtpPassword) {
            finalPassword = settingsDocSnap.data()?.smtpPassword;
          } else {
            return res.status(400).json({ error: 'SMTP Password is required for test email dispatch.' });
          }
        }

        // Direct SSL/TLS check (secure: true) for port 465
        const isPort465 = Number(smtpPort) === 465 || smtpSecureType === 'SSL/TLS';

        const transportConfig: any = {
          host: smtpHost,
          port: Number(smtpPort),
          secure: isPort465,
          auth: {
            user: smtpUsername,
            pass: finalPassword
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000
        };

        if (isPort465) {
          transportConfig.tls = {
            rejectUnauthorized: false
          };
        }

        const transporter = nodemailer.createTransport(transportConfig);

        try {
          await transporter.sendMail({
            from: `"${fromName || 'Lone Star Test'}" <${fromEmail || smtpUsername}>`,
            to: recipientEmail,
            subject: `[SYSTEM TEST] Secure SMTP Connection Verified!`,
            text: `Hello!\n\nThis is a secure system authentication check sent from your Lone Star Fence SaaS Admin Console Settings.\n\nYour current connection profile and credentials have been verified successfully on port ${smtpPort}.\n\nTime of verification: ${new Date().toLocaleString()}\nHost: ${smtpHost}\nUsername: ${smtpUsername}\n\nHave a great day!\nSystem Engineering Department`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
                <h2 style="color: #10b981; margin-top: 0;">✓ Connection Verified Successfully!</h2>
                <p>Hello,</p>
                <p>This is an automated connection check message dispatched from your Lone Star Fence SaaS Admin Console Settings.</p>
                <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px; margin: 18px 0; font-family: monospace; font-size: 13px;">
                  <strong>Host:</strong> ${smtpHost}<br/>
                  <strong>Port:</strong> ${smtpPort}<br/>
                  <strong>Username:</strong> ${smtpUsername}<br/>
                  <strong>Verified At:</strong> ${new Date().toLocaleString()}
                </div>
                <p>Your custom SMTP authentication credentials and server pathways are clear and fully operational!</p>
                <p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                  Lone Star Fence Works - Multi-tenant SaaS Node
                </p>
              </div>
            `
          });

          return res.status(200).json({ success: true, message: 'Test email transmitted successfully!' });
        } catch (err: any) {
          const errorMessage = err.message || String(err);
          console.warn('[SMTP TEST EMAIL FAILURE]:', err);
          let clientMsg = '';
          if (err.code === 'EAUTH' || errorMessage.toLowerCase().includes('auth')) {
            clientMsg = 'SMTP Connection was established, but authentication was rejected. Please verify your SMTP Username and Password.';
          } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEOUT' || err.code === 'ENOTFOUND') {
            clientMsg = `Could not connect to the SMTP mail server at ${smtpHost}:${smtpPort}. Verify the host name, port, and security type configuration.`;
          } else {
            clientMsg = `SMTP Send Failed: ${errorMessage}`;
          }
          return res.status(500).json({ success: false, error: clientMsg });
        }
      } else if (action === 'ghl-integration-status') {
        try {
          const customersSnap = await db.collection('customers').limit(1000).get();
          const totalCustomers = customersSnap.size;
          let customersFromGhl = 0;
          let customersFromApp = 0;
          let customersFromEstimator = 0;
          let customersFromPrevEstimates = 0;

          customersSnap.forEach(doc => {
            const d = doc.data() || {};
            const source = d.source || '';
            const cf = d.createdFrom || '';

            if (source === 'GHL') {
              customersFromGhl++;
            } else if (source === 'Previous Estimate') {
              customersFromPrevEstimates++;
            } else if (cf === 'customer_estimator' || source === 'Customer Estimator') {
              customersFromEstimator++;
            } else {
              customersFromApp++;
            }
          });

          // Fetch latest 50 webhook logs
          const logsSnap = await db.collection('ghlInboundWebhookLogs')
            .orderBy('receivedAt', 'desc')
            .limit(50)
            .get();

          const logs: any[] = [];
          let duplicateMergesCount = 0;

          // We can calculate last sync info from logs
          let lastInboundWebhook = '';
          let lastOutboundWebhook = ''; 
          let lastSuccessfulSync = '';
          let lastFailedSync = '';
          let lastErrorMessage = '';
          let lastContactSynced = '';
          let lastAppointmentSynced = '';

          logsSnap.forEach(doc => {
            const data = doc.data() || {};
            const matchedBy = data.matchedBy || 'new';
            const receivedAt = data.receivedAt || '';
            const success = data.success !== false;
            const eventType = data.eventType || '';

            if (matchedBy !== 'new') {
              duplicateMergesCount++;
            }

            if (!lastInboundWebhook) {
              lastInboundWebhook = receivedAt;
            }

            if (success) {
              if (!lastSuccessfulSync) {
                lastSuccessfulSync = receivedAt;
              }
              const payload = data.payload || {};
              const contactName = payload.fullName || payload.name || `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || 'Valued Customer';
              if (eventType.includes('contact') && !lastContactSynced) {
                lastContactSynced = `${contactName} (${receivedAt})`;
              }
              if (eventType.includes('appointment') && !lastAppointmentSynced) {
                lastAppointmentSynced = `${contactName} (Appt: ${payload.appointmentStartTime || receivedAt})`;
              }
            } else {
              if (!lastFailedSync) {
                lastFailedSync = receivedAt;
                lastErrorMessage = data.error || 'Webhook failed with unauthorized or failed sync';
              }
            }

            logs.push({
              id: doc.id,
              receivedAt,
              eventType,
              matchedBy,
              customerId: data.customerId || '',
              ghlContactId: data.ghlContactId || '',
              success,
              error: data.error || '',
              payload: data.payload || null
            });
          });

          // Let's search historical merge counts
          if (duplicateMergesCount === 0) {
            const mergeSnap = await db.collection('ghlInboundWebhookLogs')
              .where('matchedBy', 'in', ['ghlContactId', 'email', 'phone'])
              .limit(100)
              .get();
            duplicateMergesCount = mergeSnap.size;
          }

          // Let's also check for scheduler sync info specifically
          let lastAppointmentReceived = '';
          let lastAppointmentCreated = '';
          let lastAppointmentUpdated = '';
          let calendarId = '';
          let appointmentSource = '';

          const apptLogsSnap = await db.collection('ghlInboundWebhookLogs')
            .where('eventType', '==', 'inbound-appointment-created')
            .orderBy('receivedAt', 'desc')
            .limit(5)
            .get();

          if (!apptLogsSnap.empty) {
            const firstLog = apptLogsSnap.docs[0].data();
            lastAppointmentReceived = firstLog.receivedAt || '';
            lastAppointmentCreated = firstLog.receivedAt || '';
            const payload = firstLog.payload || {};
            calendarId = payload.calendarId || payload.calendar_id || '';
            appointmentSource = payload.appointmentSource || 'GHL Scheduler';
          }

          return res.status(200).json({
            success: true,
            stats: {
              totalCustomers,
              customersFromGhl,
              customersFromApp,
              customersFromEstimator,
              customersFromPrevEstimates,
              duplicateMerges: duplicateMergesCount,
              lastSyncTime: lastSuccessfulSync || 'Never Synced'
            },
            status: {
              outbound: 'Connected', 
              inbound: logs.length > 0 ? 'Connected' : 'Waiting',
              lastInboundWebhook,
              lastOutboundWebhook: lastSuccessfulSync || '', 
              lastSuccessfulSync,
              lastFailedSync,
              lastErrorMessage,
              lastContactSynced,
              lastAppointmentSynced
            },
            scheduler: {
              active: true,
              lastAppointmentReceived,
              lastAppointmentCreated,
              lastAppointmentUpdated: lastAppointmentReceived,
              calendarId,
              appointmentSource
            },
            logs
          });
        } catch (err: any) {
          console.warn('Failed retrieving GHL integration status:', err);
          return res.status(500).json({ success: false, error: err.message || String(err) });
        }
      } else if (action === 'test-ghl-outbound') {
        const { ghlWebhookUrl } = req.body;
        const targetUrl = ghlWebhookUrl || '';
        if (!targetUrl) {
          return res.status(400).json({ success: false, error: 'Outbound webhook URL is blank.' });
        }

        try {
          const samplePayload = {
            eventType: 'instant_estimate_submitted',
            leadSource: 'Instant Estimator (Admin Test)',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe.test@lonestarfence.com',
            phone: '+15555555555',
            address: '123 Test Street/Admin Test',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            fenceType: 'Wood Cedar',
            height: '6ft',
            linearFeet: 150,
            gateCount: 2,
            estimatedPrice: 3500,
            jobStatus: 'Interested',
            estimateId: 'test-estimate-id-admin-test',
            createdAt: new Date().toISOString()
          };

          const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(samplePayload)
          });

          const responseText = await response.text();
          return res.status(200).json({
            success: response.ok,
            status: response.status,
            statusCode: response.status,
            responseText: responseText.slice(0, 500),
            message: response.ok ? 'Outbound test payload dispatched successfully!' : `Outbound target responded with Status ${response.status}`
          });
        } catch (err: any) {
          return res.status(200).json({
            success: false,
            error: err.message || String(err),
            message: 'Outbound connection failed. Verify URL configuration and network routing.'
          });
        }
      } else if (action === 'test-ghl-inbound') {
        const { secret } = req.body;
        if (!secret) {
          return res.status(400).json({ success: false, error: 'Inbound Webhook Secret cannot be empty to run test.' });
        }

        try {
          const sampleInbound = {
            eventType: 'contactCreate',
            type: 'contactCreate',
            contactId: 'test_ghl_' + Math.floor(Math.random() * 1000000),
            firstName: 'GHL Inbound',
            lastName: 'Test User',
            fullName: 'GHL Inbound Test User',
            email: `ghl.test.${Math.floor(Math.random() * 1000000)}@lonestarfence.com`,
            phone: '512555' + Math.floor(1000 + Math.random() * 9000),
            address1: '456 Webhook Avenue',
            city: 'Round Rock',
            state: 'TX',
            zip: '78664',
            source: 'GHL Webhook Test',
            tags: 'test, admin-prefill-check',
            appointmentStartTime: new Date(Date.now() + 86400000).toISOString(),
            calendarId: 'test_calendar_id_999'
          };

          // Make direct POST call to localhost:3000/api/webhooks/ghl
          const hookResponse = await fetch(`http://localhost:3000/api/webhooks/ghl?secret=${encodeURIComponent(secret)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-lsfw-webhook-secret': secret
            },
            body: JSON.stringify(sampleInbound)
          });

          const resJson: any = await hookResponse.json().catch(() => ({}));
          const success = hookResponse.status === 200 && resJson.success;

          const diagnostics = {
            endpointUrl: `http://localhost:3000/api/webhooks/ghl?secret=${secret.substring(0, 5)}...`,
            httpStatus: hookResponse.status,
            responseBody: resJson,
            matchedBy: resJson.matchedBy || 'unknown',
            customerId: resJson.customerId || 'none'
          };

          return res.status(200).json({
            success: !!success,
            message: success ? 'PASS: Inbound webhook successfully processed!' : 'FAIL: Webhook process returned warnings or errors.',
            diagnostics
          });
        } catch (err: any) {
          return res.status(200).json({
            success: false,
            message: 'FAIL: Outermost connection exception during localhost simulation.',
            error: err.message || String(err)
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
