import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Save, Globe, Mail, Building2, Phone, MapPin, 
  Webhook, ShieldCheck, Bell, RefreshCw, CheckCircle2, XCircle,
  ImageIcon, Server, Settings2, Send, AlertCircle, Terminal,
  Eye, EyeOff, Copy, Plus, Activity, Check, Database, Sparkles,
  Calendar, Search, Lock, Key, CheckSquare, Square
} from 'lucide-react';
import { cn } from '../lib/utils';
import { COMPANY_INFO } from '../constants';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import GhlIntegrationCenter from './GhlIntegrationCenter';

interface SettingsProps {
  user?: any;
  adminToken?: string | null;
}

export default function Settings({ user, adminToken }: SettingsProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState<'company' | 'integration' | 'smtp' | 'templates' | 'notifications'>('company');
  
  const [formData, setFormData] = React.useState({
    companyName: COMPANY_INFO.name,
    businessEmail: COMPANY_INFO.email,
    phoneNumber: COMPANY_INFO.phone,
    website: COMPANY_INFO.website,
    address: COMPANY_INFO.address,
    companyLogo: COMPANY_INFO.logo || '',
    ghlWebhookUrl: '',
    ghlWebhookInstantEstimateSubmitted: '',
    ghlWebhookManualEstimateSent: '',
    ghlWebhookEstimateAccepted: '',
    ghlWebhookEstimateCompleted: '',
    ghlWebhookEstimateDeclined: '',
    autoSyncEstimates: true,
    
    // GHL Inbound and Prefill Configuration
    ghlLocationId: '',
    ghlApiKey: '',
    ghlInboundWebhookSecret: '',
    ghlPrefillSources: ['customers', 'estimates', 'ghl'] as string[],
    ghlMinChars: 2,
    ghlMaxResults: 10,
    
    // Outbound automation suppression controls
    enableInstantEstimateWebhook: true,
    suppressInstantEstimateWorkflowExisting: true,
    suppressIfEstimateScheduled: true,
    suppressIfEstimateSent: true,
    suppressIfCustomerAccepted: true,
    suppressIfCustomerCompleted: true,
    allowManualForceTrigger: true,

    // GHL Direct API Sync Layer
    enableGhlApiSync: false,
    keepGhlLegacyWebhooks: true,
    ghlPipelineId: '',
    ghlOpportunityStages: {
      'Interested': '',
      'Appointment Requested': '',
      'Estimate Scheduled': '',
      'Estimate Sent': '',
      'Accepted': '',
      'Declined': '',
      'Scheduled': '',
      'Completed': '',
      'Archived': ''
    },
    ghlCustomFields: {
      'estimateId': '',
      'estimateNumber': '',
      'estimateLink': '',
      'estimatedPrice': '',
      'fenceType': '',
      'linearFeet': '',
      'jobStatus': '',
      'customerEstimatorSubmittedAt': '',
      'lastEstimateSentAt': '',
      'acceptedAt': '',
      'declinedAt': '',
      'scheduledStartDate': '',
      'completedAt': ''
    },
    enableGhlCalendarPrimaryScheduler: false,
    sendCrewEmailAfterGhlInstallBooking: true,
    sendAdminBackupEmail: true,
    requireEstimateIdMatching: false,
    allowFallbackMatching: true,
    ghlInstallCalendarId: '',
    minimumInstallLeadDays: 4,
    
    // Email dispatch (Resend vs SMTP)
    emailProvider: 'resend' as 'resend' | 'smtp',
    resendApiKey: '',
    adminNotificationEmail: 'bradens@lonestarfenceworks.com',
    sendCopyBccToAdmin: true,
    enableEmailEventTracking: false,
    enableResendWebhook: false,
    
    // SMTP Configurations
    smtpHost: '',
    smtpPort: '465',
    smtpSecureType: 'SSL/TLS' as 'SSL/TLS' | 'STARTTLS' | 'None',
    smtpUsername: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
    replyToEmail: '',
    googleReviewLink: '',

    // Outbound templates
    estimateEmailSubject: '',
    estimateEmailBody: '',
    estimateAcceptedMessage: '',
    estimateDeclinedMessage: ''
  });

  const [selectedPreset, setSelectedPreset] = React.useState('custom');

  // Test Email dispatcher state
  const [testRecipient, setTestRecipient] = React.useState('');
  const [isSendingTest, setIsSendingTest] = React.useState(false);
  const [testSuccess, setTestSuccess] = React.useState<string | null>(null);
  const [testError, setTestError] = React.useState<string | null>(null);

  const smtpPresets: Record<string, { host: string; port: string; secure: 'SSL/TLS' | 'STARTTLS' | 'None' }> = {
    zenbusiness: { host: 'mail.b.hostedemail.com', port: '465', secure: 'SSL/TLS' },
    gmail: { host: 'smtp.gmail.com', port: '587', secure: 'STARTTLS' },
    outlook: { host: 'smtp.office365.com', port: '587', secure: 'STARTTLS' },
    godaddy: { host: 'smtpout.secureserver.net', port: '465', secure: 'SSL/TLS' },
    custom: { host: '', port: '465', secure: 'SSL/TLS' }
  };

  const [primaryCrewEmail, setPrimaryCrewEmail] = React.useState<string | null>(null);
  const [primaryCrewName, setPrimaryCrewName] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchPrimaryCrew() {
      try {
        const q = query(collection(db, 'employees'), where('isPrimaryCrewContact', '==', true));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const emp = snap.docs[0].data();
          if (emp && emp.isActive !== false) {
            setPrimaryCrewEmail(emp.email || null);
            setPrimaryCrewName(emp.name || null);
          }
        }
      } catch (err) {
        console.warn("Could not fetch primary crew contact in Settings:", err);
      }
    }
    fetchPrimaryCrew();
  }, []);

  // Load settings on mount
  React.useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);
      try {
        let firebaseData: any = {};
        let apiData: any = {};

        // 1. Try to load from direct client Firestore companySettings/main
        try {
          const settingsDoc = await getDoc(doc(db, 'companySettings', 'main'));
          if (settingsDoc.exists()) {
            firebaseData = settingsDoc.data();
          }
        } catch (error) {
          console.warn("Could not load from Firestore companySettings/main:", error);
        }

        // 2. Try to load secure SMTP & Templates from API
        const token = adminToken || localStorage.getItem('company_admin_token');
        if (token) {
          try {
            const response = await fetch('/api/settings', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
              apiData = await response.json();
            }
          } catch (apiErr) {
            console.warn("Failed to load settings via API:", apiErr);
          }
        }

        // Merge loaded profiles securely
        const merged = {
          ...formData,
          ...firebaseData,
          ...apiData,
          companyName: apiData.companyName || firebaseData.companyName || COMPANY_INFO.name,
          businessEmail: apiData.companyEmail || apiData.businessEmail || firebaseData.businessEmail || firebaseData.companyEmail || COMPANY_INFO.email,
          phoneNumber: apiData.companyPhone || apiData.phoneNumber || firebaseData.phoneNumber || firebaseData.companyPhone || COMPANY_INFO.phone,
          website: apiData.companyWebsite || apiData.website || firebaseData.website || firebaseData.companyWebsite || COMPANY_INFO.website,
          address: apiData.address || firebaseData.address || COMPANY_INFO.address,
          companyLogo: apiData.companyLogo || firebaseData.companyLogo || COMPANY_INFO.logo || '',
          emailProvider: apiData.emailProvider || firebaseData.emailProvider || 'resend',
          resendApiKey: apiData.resendApiKey || firebaseData.resendApiKey || '',
          adminNotificationEmail: apiData.adminNotificationEmail || firebaseData.adminNotificationEmail || 'bradens@lonestarfenceworks.com',
          sendCopyBccToAdmin: apiData.sendCopyBccToAdmin !== undefined ? apiData.sendCopyBccToAdmin : (firebaseData.sendCopyBccToAdmin !== undefined ? firebaseData.sendCopyBccToAdmin : true),
          enableEmailEventTracking: apiData.enableEmailEventTracking !== undefined ? apiData.enableEmailEventTracking : (firebaseData.enableEmailEventTracking !== undefined ? firebaseData.enableEmailEventTracking : false),
          enableResendWebhook: apiData.enableResendWebhook !== undefined ? apiData.enableResendWebhook : (firebaseData.enableResendWebhook !== undefined ? firebaseData.enableResendWebhook : false),
          ghlWebhookUrl: apiData.gohighlevelWebhookUrl || apiData.ghlWebhookUrl || firebaseData.ghlWebhookUrl || firebaseData.gohighlevelWebhookUrl || '',
          ghlWebhookInstantEstimateSubmitted: apiData.ghlWebhookInstantEstimateSubmitted || firebaseData.ghlWebhookInstantEstimateSubmitted || '',
          ghlWebhookManualEstimateSent: apiData.ghlWebhookManualEstimateSent || firebaseData.ghlWebhookManualEstimateSent || '',
          ghlWebhookEstimateAccepted: apiData.ghlWebhookEstimateAccepted || firebaseData.ghlWebhookEstimateAccepted || '',
          ghlWebhookEstimateCompleted: apiData.ghlWebhookEstimateCompleted || firebaseData.ghlWebhookEstimateCompleted || '',
          ghlWebhookEstimateDeclined: apiData.ghlWebhookEstimateDeclined || firebaseData.ghlWebhookEstimateDeclined || '',
          smtpPort: String(apiData.smtpPort || firebaseData.smtpPort || '465'),
          ghlLocationId: apiData.ghlLocationId || firebaseData.ghlLocationId || '',
          ghlApiKey: apiData.ghlApiKey || firebaseData.ghlApiKey || '',
          ghlInboundWebhookSecret: apiData.ghlInboundWebhookSecret || firebaseData.ghlInboundWebhookSecret || '',
          ghlPrefillSources: apiData.ghlPrefillSources || firebaseData.ghlPrefillSources || ['customers', 'estimates', 'ghl'],
          ghlMinChars: apiData.ghlMinChars !== undefined ? apiData.ghlMinChars : (firebaseData.ghlMinChars !== undefined ? firebaseData.ghlMinChars : 2),
          ghlMaxResults: apiData.ghlMaxResults !== undefined ? apiData.ghlMaxResults : (firebaseData.ghlMaxResults !== undefined ? firebaseData.ghlMaxResults : 10),
          
          enableInstantEstimateWebhook: apiData.enableInstantEstimateWebhook !== undefined ? apiData.enableInstantEstimateWebhook : (firebaseData.enableInstantEstimateWebhook !== undefined ? firebaseData.enableInstantEstimateWebhook : true),
          suppressInstantEstimateWorkflowExisting: apiData.suppressInstantEstimateWorkflowExisting !== undefined ? apiData.suppressInstantEstimateWorkflowExisting : (firebaseData.suppressInstantEstimateWorkflowExisting !== undefined ? firebaseData.suppressInstantEstimateWorkflowExisting : true),
          suppressIfEstimateScheduled: apiData.suppressIfEstimateScheduled !== undefined ? apiData.suppressIfEstimateScheduled : (firebaseData.suppressIfEstimateScheduled !== undefined ? firebaseData.suppressIfEstimateScheduled : true),
          suppressIfEstimateSent: apiData.suppressIfEstimateSent !== undefined ? apiData.suppressIfEstimateSent : (firebaseData.suppressIfEstimateSent !== undefined ? firebaseData.suppressIfEstimateSent : true),
          suppressIfCustomerAccepted: apiData.suppressIfCustomerAccepted !== undefined ? apiData.suppressIfCustomerAccepted : (firebaseData.suppressIfCustomerAccepted !== undefined ? firebaseData.suppressIfCustomerAccepted : true),
          suppressIfCustomerCompleted: apiData.suppressIfCustomerCompleted !== undefined ? apiData.suppressIfCustomerCompleted : (firebaseData.suppressIfCustomerCompleted !== undefined ? firebaseData.suppressIfCustomerCompleted : true),
          allowManualForceTrigger: apiData.allowManualForceTrigger !== undefined ? apiData.allowManualForceTrigger : (firebaseData.allowManualForceTrigger !== undefined ? firebaseData.allowManualForceTrigger : true),
          
          enableGhlApiSync: apiData.enableGhlApiSync !== undefined ? apiData.enableGhlApiSync : (firebaseData.enableGhlApiSync !== undefined ? firebaseData.enableGhlApiSync : false),
          keepGhlLegacyWebhooks: apiData.keepGhlLegacyWebhooks !== undefined ? apiData.keepGhlLegacyWebhooks : (firebaseData.keepGhlLegacyWebhooks !== undefined ? firebaseData.keepGhlLegacyWebhooks : true),
          ghlPipelineId: apiData.ghlPipelineId || firebaseData.ghlPipelineId || '',
          ghlOpportunityStages: apiData.ghlOpportunityStages || firebaseData.ghlOpportunityStages || {
            'Interested': '',
            'Appointment Requested': '',
            'Estimate Scheduled': '',
            'Estimate Sent': '',
            'Accepted': '',
            'Declined': '',
            'Scheduled': '',
            'Completed': '',
            'Archived': ''
          },
          ghlCustomFields: apiData.ghlCustomFields || firebaseData.ghlCustomFields || {
            'estimateId': '',
            'estimateNumber': '',
            'estimateLink': '',
            'estimatedPrice': '',
            'fenceType': '',
            'linearFeet': '',
            'jobStatus': '',
            'customerEstimatorSubmittedAt': '',
            'lastEstimateSentAt': '',
            'acceptedAt': '',
            'declinedAt': '',
            'scheduledStartDate': '',
            'completedAt': '',
            'minimumInstallDate': '',
            'customerName': '',
            'address': ''
          },
          enableGhlCalendarPrimaryScheduler: apiData.enableGhlCalendarPrimaryScheduler !== undefined ? apiData.enableGhlCalendarPrimaryScheduler : (firebaseData.enableGhlCalendarPrimaryScheduler !== undefined ? firebaseData.enableGhlCalendarPrimaryScheduler : false),
          sendCrewEmailAfterGhlInstallBooking: apiData.sendCrewEmailAfterGhlInstallBooking !== undefined ? apiData.sendCrewEmailAfterGhlInstallBooking : (firebaseData.sendCrewEmailAfterGhlInstallBooking !== undefined ? firebaseData.sendCrewEmailAfterGhlInstallBooking : true),
          sendAdminBackupEmail: apiData.sendAdminBackupEmail !== undefined ? apiData.sendAdminBackupEmail : (firebaseData.sendAdminBackupEmail !== undefined ? firebaseData.sendAdminBackupEmail : true),
          requireEstimateIdMatching: apiData.requireEstimateIdMatching !== undefined ? apiData.requireEstimateIdMatching : (firebaseData.requireEstimateIdMatching !== undefined ? firebaseData.requireEstimateIdMatching : false),
          allowFallbackMatching: apiData.allowFallbackMatching !== undefined ? apiData.allowFallbackMatching : (firebaseData.allowFallbackMatching !== undefined ? firebaseData.allowFallbackMatching : true),
          ghlInstallCalendarId: apiData.ghlInstallCalendarId || firebaseData.ghlInstallCalendarId || '',
          minimumInstallLeadDays: apiData.minimumInstallLeadDays !== undefined ? apiData.minimumInstallLeadDays : (firebaseData.minimumInstallLeadDays !== undefined ? firebaseData.minimumInstallLeadDays : 4)
        };

        setFormData(merged);

        // Auto detect preset if standard smtp settings are populated
        const hostVal = merged.smtpHost || '';
        const portVal = String(merged.smtpPort || '465');
        const secureVal = merged.smtpSecureType || 'SSL/TLS';
        
        const matchingPreset = Object.entries(smtpPresets).find(([_, config]) => {
          return config.host === hostVal && Number(config.port) === Number(portVal) && config.secure === secureVal;
        });
        if (matchingPreset) {
          setSelectedPreset(matchingPreset[0]);
        } else {
          setSelectedPreset('custom');
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [adminToken]);

  // Dynamic background loading for GoHighLevel dropdown values if credentials are setup
  React.useEffect(() => {
    if (formData.ghlLocationId && formData.ghlApiKey) {
      handleLoadGhlData(true).catch(err => console.warn('Background GHL load skipped:', err));
    }
  }, [formData.ghlLocationId, formData.ghlApiKey]);

  // Handle SMTP preset change
  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const config = smtpPresets[presetKey];
    if (config) {
      setFormData(prev => ({
        ...prev,
        smtpHost: config.host,
        smtpPort: config.port,
        smtpSecureType: config.secure
      }));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      // 1. Client-side database update to companySettings/main for direct frontend configurations
      const clientPayload = {
        companyName: formData.companyName,
        businessEmail: formData.businessEmail,
        phoneNumber: formData.phoneNumber,
        website: formData.website,
        address: formData.address,
        companyLogo: formData.companyLogo,
        emailProvider: formData.emailProvider,
        resendApiKey: formData.resendApiKey,
        adminNotificationEmail: formData.adminNotificationEmail,
        sendCopyBccToAdmin: formData.sendCopyBccToAdmin,
        enableEmailEventTracking: formData.enableEmailEventTracking,
        enableResendWebhook: formData.enableResendWebhook,
        ghlWebhookUrl: formData.ghlWebhookUrl,
        gohighlevelWebhookUrl: formData.ghlWebhookUrl,
        ghlWebhookInstantEstimateSubmitted: formData.ghlWebhookInstantEstimateSubmitted,
        ghlWebhookManualEstimateSent: formData.ghlWebhookManualEstimateSent,
        ghlWebhookEstimateAccepted: formData.ghlWebhookEstimateAccepted,
        ghlWebhookEstimateCompleted: formData.ghlWebhookEstimateCompleted,
        ghlWebhookEstimateDeclined: formData.ghlWebhookEstimateDeclined,
        googleReviewLink: formData.googleReviewLink,
        autoSyncEstimates: formData.autoSyncEstimates,
        
        // GHL configurations
        ghlLocationId: formData.ghlLocationId,
        ghlApiKey: formData.ghlApiKey,
        ghlInboundWebhookSecret: formData.ghlInboundWebhookSecret,
        ghlPrefillSources: formData.ghlPrefillSources,
        ghlMinChars: formData.ghlMinChars,
        ghlMaxResults: formData.ghlMaxResults,
        
        enableInstantEstimateWebhook: formData.enableInstantEstimateWebhook,
        suppressInstantEstimateWorkflowExisting: formData.suppressInstantEstimateWorkflowExisting,
        suppressIfEstimateScheduled: formData.suppressIfEstimateScheduled,
        suppressIfEstimateSent: formData.suppressIfEstimateSent,
        suppressIfCustomerAccepted: formData.suppressIfCustomerAccepted,
        suppressIfCustomerCompleted: formData.suppressIfCustomerCompleted,
        allowManualForceTrigger: formData.allowManualForceTrigger,

        // Direct GHL API Sync configs
        enableGhlApiSync: formData.enableGhlApiSync,
        keepGhlLegacyWebhooks: formData.keepGhlLegacyWebhooks,
        ghlPipelineId: formData.ghlPipelineId,
        ghlOpportunityStages: formData.ghlOpportunityStages,
        ghlCustomFields: formData.ghlCustomFields,
        enableGhlCalendarPrimaryScheduler: formData.enableGhlCalendarPrimaryScheduler,
        sendCrewEmailAfterGhlInstallBooking: formData.sendCrewEmailAfterGhlInstallBooking,
        sendAdminBackupEmail: formData.sendAdminBackupEmail,
        requireEstimateIdMatching: formData.requireEstimateIdMatching,
        allowFallbackMatching: formData.allowFallbackMatching,
        ghlInstallCalendarId: formData.ghlInstallCalendarId,
        minimumInstallLeadDays: formData.minimumInstallLeadDays,
        
        // Include templates inside main doc so embed widgets can pull acceptance screens
        estimateEmailSubject: formData.estimateEmailSubject,
        estimateEmailBody: formData.estimateEmailBody,
        estimateAcceptedMessage: formData.estimateAcceptedMessage,
        estimateDeclinedMessage: formData.estimateDeclinedMessage,
        
        updatedAt: new Date().toISOString()
      };
      
      try {
        await setDoc(doc(db, 'companySettings', 'main'), clientPayload, { merge: true });
      } catch (clientErr) {
        console.error("Error saving directly to firestore:", clientErr);
      }

      // 2. API Backend Secure save to establish validated node server environment
      const token = adminToken || localStorage.getItem('company_admin_token');
      if (token) {
        const apiPayload = {
          action: 'save',
          companyName: formData.companyName,
          companyEmail: formData.businessEmail,
          companyPhone: formData.phoneNumber,
          companyWebsite: formData.website,
          companyLogo: formData.companyLogo,
          
          emailProvider: formData.emailProvider,
          resendApiKey: formData.resendApiKey,
          adminNotificationEmail: formData.adminNotificationEmail,
          sendCopyBccToAdmin: formData.sendCopyBccToAdmin,
          enableEmailEventTracking: formData.enableEmailEventTracking,
          enableResendWebhook: formData.enableResendWebhook,
          
          smtpHost: formData.smtpHost,
          smtpPort: Number(formData.smtpPort),
          smtpSecureType: formData.smtpSecureType,
          smtpUsername: formData.smtpUsername,
          smtpPassword: formData.smtpPassword,
          fromEmail: formData.fromEmail,
          fromName: formData.fromName,
          replyToEmail: formData.replyToEmail,
          
          gohighlevelWebhookUrl: formData.ghlWebhookUrl,
          ghlWebhookInstantEstimateSubmitted: formData.ghlWebhookInstantEstimateSubmitted,
          ghlWebhookManualEstimateSent: formData.ghlWebhookManualEstimateSent,
          ghlWebhookEstimateAccepted: formData.ghlWebhookEstimateAccepted,
          ghlWebhookEstimateCompleted: formData.ghlWebhookEstimateCompleted,
          ghlWebhookEstimateDeclined: formData.ghlWebhookEstimateDeclined,
          googleReviewLink: formData.googleReviewLink,
          estimateEmailSubject: formData.estimateEmailSubject,
          estimateEmailBody: formData.estimateEmailBody,
          estimateAcceptedMessage: formData.estimateAcceptedMessage,
          estimateDeclinedMessage: formData.estimateDeclinedMessage,

          ghlLocationId: formData.ghlLocationId,
          ghlApiKey: formData.ghlApiKey,
           ghlInboundWebhookSecret: formData.ghlInboundWebhookSecret,
          ghlPrefillSources: formData.ghlPrefillSources,
          ghlMinChars: formData.ghlMinChars,
          ghlMaxResults: formData.ghlMaxResults,
          enableInstantEstimateWebhook: formData.enableInstantEstimateWebhook,
          suppressInstantEstimateWorkflowExisting: formData.suppressInstantEstimateWorkflowExisting,
          suppressIfEstimateScheduled: formData.suppressIfEstimateScheduled,
          suppressIfEstimateSent: formData.suppressIfEstimateSent,
          suppressIfCustomerAccepted: formData.suppressIfCustomerAccepted,
          suppressIfCustomerCompleted: formData.suppressIfCustomerCompleted,
          allowManualForceTrigger: formData.allowManualForceTrigger,

          // Direct GHL API Sync configs
          enableGhlApiSync: formData.enableGhlApiSync,
          keepGhlLegacyWebhooks: formData.keepGhlLegacyWebhooks,
          ghlPipelineId: formData.ghlPipelineId,
          ghlOpportunityStages: formData.ghlOpportunityStages,
          ghlCustomFields: formData.ghlCustomFields,
          enableGhlCalendarPrimaryScheduler: formData.enableGhlCalendarPrimaryScheduler,
          sendCrewEmailAfterGhlInstallBooking: formData.sendCrewEmailAfterGhlInstallBooking,
          sendAdminBackupEmail: formData.sendAdminBackupEmail,
          requireEstimateIdMatching: formData.requireEstimateIdMatching,
          allowFallbackMatching: formData.allowFallbackMatching,
          ghlInstallCalendarId: formData.ghlInstallCalendarId,
          minimumInstallLeadDays: formData.minimumInstallLeadDays,
        };

        const response = await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(apiPayload)
        });

        const resData = await response.json();
        if (!response.ok) {
          throw new Error(resData.error || 'Failed to save settings to secure server.');
        }
      }

      setShowSuccess(true);
      setSaveSuccess('Global settings & SMTP communication profiles saved successfully!');
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error saving settings:", error);
      setSaveError(error.message || "Failed to save settings. Please verify details and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // GHL live status & tests states
  const [ghlStatus, setGhlStatus] = React.useState<any>(null);
  const [isFetchStatusLoading, setIsFetchStatusLoading] = React.useState(false);
  const [isTestingOutbound, setIsTestingOutbound] = React.useState(false);
  const [isTestingInbound, setIsTestingInbound] = React.useState(false);
  const [testOutboundResult, setTestOutboundResult] = React.useState<any>(null);
  const [testInboundResult, setTestInboundResult] = React.useState<any>(null);
  const [copiedSecret, setCopiedSecret] = React.useState(false);
  const [copiedUrl, setCopiedUrl] = React.useState(false);
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [expandedLogId, setExpandedLogId] = React.useState<string | null>(null);

  // Enterprise diagnostic additional states
  const [isTestingDiagnostic, setIsTestingDiagnostic] = React.useState(false);
  const [diagnosticResult, setDiagnosticResult] = React.useState<any>(null);
  const [dupForm, setDupForm] = React.useState({ name: '', email: '', phone: '' });
  const [isCheckingDuplicate, setIsCheckingDuplicate] = React.useState(false);
  const [checkDuplicateResult, setCheckDuplicateResult] = React.useState<any>(null);
  const [prefillQuery, setPrefillQuery] = React.useState('');
  const [isTestingPrefillQuery, setIsTestingPrefillQuery] = React.useState(false);
  const [prefillResults, setPrefillResults] = React.useState<any[]>([]);

  // GHL Connected API Sync Test suite
  const [isTestingApiSync, setIsTestingApiSync] = React.useState(false);
  const [testApiSyncResult, setTestApiSyncResult] = React.useState<any>(null);

  // Loadable GHL lists and settings auto configure states
  const [ghlPipelines, setGhlPipelines] = React.useState<any[]>([]);
  const [ghlCustomFieldOptions, setGhlCustomFieldOptions] = React.useState<any[]>([]);
  const [isLoadingGhlData, setIsLoadingGhlData] = React.useState(false);
  const [ghlLoadError, setGhlLoadError] = React.useState<string | null>(null);
  const [missingCustomFieldsList, setMissingCustomFieldsList] = React.useState<any[]>([]);
  const [isCreatingFields, setIsCreatingFields] = React.useState(false);
  const [showConfirmCreateCustomFieldsModal, setShowConfirmCreateCustomFieldsModal] = React.useState(false);
  const [isAutoConfiguring, setIsAutoConfiguring] = React.useState(false);
  const [autoConfigSuccess, setAutoConfigSuccess] = React.useState<string | null>(null);

  // Checks and maps retrieved custom fields dynamically
  const checkMissingCustomFields = (retrievedFields: any[], currentMappings: any) => {
    const REQUIRED_LIST = [
      { key: 'estimateId', label: 'Estimate ID', dataType: 'TEXT' },
      { key: 'estimateNumber', label: 'Estimate Number', dataType: 'TEXT' },
      { key: 'estimateLink', label: 'Estimate Contract Link', dataType: 'TEXT' },
      { key: 'estimatedPrice', label: 'Estimated Total', dataType: 'MONETORY' },
      { key: 'fenceType', label: 'Fence Type', dataType: 'TEXT' },
      { key: 'linearFeet', label: 'Linear Feet', dataType: 'NUMERICAL' },
      { key: 'jobStatus', label: 'Job Status', dataType: 'TEXT' },
      { key: 'customerEstimatorSubmittedAt', label: 'Estimator Submitted Date', dataType: 'DATE' },
      { key: 'lastEstimateSentAt', label: 'Last Estimate Sent Date', dataType: 'DATE' },
      { key: 'acceptedAt', label: 'Contract Accepted Date', dataType: 'DATE' },
      { key: 'declinedAt', label: 'Contract Declined Date', dataType: 'DATE' },
      { key: 'scheduledStartDate', label: 'Project Scheduled Start Date', dataType: 'DATE' },
      { key: 'completedAt', label: 'Project Completed Date', dataType: 'DATE' }
    ];

    const missing: any[] = [];
    const updatedMappings = { ...currentMappings };
    let mappingChanged = false;

    REQUIRED_LIST.forEach((reqField) => {
      // Find field in retrieved list by saved ID or by name
      const existingById = reqField.key && updatedMappings[reqField.key] 
        ? retrievedFields.find((f: any) => f.id === updatedMappings[reqField.key] || f.fieldKey === updatedMappings[reqField.key])
        : null;

      const existingByName = retrievedFields.find(
        (f: any) => (f.name || '').trim().toLowerCase() === reqField.label.toLowerCase()
      );

      const resolvedField = existingById || existingByName;

      if (resolvedField) {
        // If it was not mapped or mapped differently, auto-assign it
        if (updatedMappings[reqField.key] !== resolvedField.id) {
          updatedMappings[reqField.key] = resolvedField.id;
          mappingChanged = true;
        }
      } else {
        missing.push(reqField);
      }
    });

    if (mappingChanged) {
      setFormData(prev => ({
        ...prev,
        ghlCustomFields: {
          ...(prev.ghlCustomFields || {}),
          ...updatedMappings
        }
      }));
    }

    setMissingCustomFieldsList(missing);
    return { missing, updatedMappings };
  };

  const handleLoadGhlData = async (quiet = false) => {
    setIsLoadingGhlData(true);
    setGhlLoadError(null);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      
      // Load pipelines
      const pipeRes = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'ghl-load-pipelines',
          ghlApiKey: formData.ghlApiKey,
          ghlLocationId: formData.ghlLocationId
        })
      });
      const pData = await pipeRes.json();
      if (!pipeRes.ok || pData.success === false) {
        throw new Error(pData.error || pData.message || 'Failed loading GHL pipelines.');
      }
      setGhlPipelines(pData.pipelines || []);

      // Load custom fields
      const cfRes = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'ghl-load-custom-fields',
          ghlApiKey: formData.ghlApiKey,
          ghlLocationId: formData.ghlLocationId
        })
      });
      const cfData = await cfRes.json();
      if (!cfRes.ok || cfData.success === false) {
        throw new Error(cfData.error || cfData.message || 'Failed loading GHL custom fields.');
      }
      
      if (cfData.unsupported) {
        setGhlLoadError('Automatic custom field loading is not currently supported by the GoHighLevel API.');
        setGhlCustomFieldOptions([]);
        setMissingCustomFieldsList([]);
        if (!quiet) {
          setAutoConfigSuccess('Success: Loaded pipelines from GoHighLevel! Note: Custom field loading unsupported.');
          setTimeout(() => setAutoConfigSuccess(null), 5000);
        }
      } else {
        const retrievedFields = cfData.customFields || [];
        setGhlCustomFieldOptions(retrievedFields);

        // Analyze missing fields
        checkMissingCustomFields(retrievedFields, formData.ghlCustomFields || {});

        if (!quiet) {
          setAutoConfigSuccess('Success: Loaded pipelines and custom fields from GoHighLevel!');
          setTimeout(() => setAutoConfigSuccess(null), 5000);
        }
      }
    } catch (err: any) {
      setGhlLoadError(err.message || String(err));
    } finally {
      setIsLoadingGhlData(false);
    }
  };

  const handleCreateMissingFields = async () => {
    if (missingCustomFieldsList.length === 0) return;
    setIsCreatingFields(true);
    setGhlLoadError(null);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      
      const newCustomFields = { ...(formData.ghlCustomFields || {}) };
      
      for (const field of missingCustomFieldsList) {
        console.log('Safe Custom Field Creation Request Preview:', {
          fieldLabel: field.label,
          datatype: field.dataType,
          locationId: formData.ghlLocationId,
          requestBodyKeys: ['action', 'ghlApiKey', 'ghlLocationId', 'name', 'dataType']
        });

        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'ghl-create-custom-field',
            ghlApiKey: formData.ghlApiKey,
            ghlLocationId: formData.ghlLocationId,
            name: field.label,
            dataType: field.dataType
          })
        });
        const data = await res.json();
        if (!res.ok || data.success === false) {
          throw new Error(`Failed creating ${field.label}. GHL rejected datatype ${field.dataType}.`);
        }
        if (data.customField && data.customField.id) {
          newCustomFields[field.key] = data.customField.id;
        }
      }

      // 1. Reload/Refetch GHL custom fields
      const refetchRes = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'ghl-load-custom-fields',
          ghlApiKey: formData.ghlApiKey,
          ghlLocationId: formData.ghlLocationId
        })
      });
      const refetchData = await refetchRes.json();
      let refreshedOptions = [];
      if (refetchRes.ok && refetchData.success) {
        refreshedOptions = refetchData.customFields || [];
        setGhlCustomFieldOptions(refreshedOptions);
      }

      // 2. Auto-map newly created fields to setting mappings
      const { missing, updatedMappings } = checkMissingCustomFields(refreshedOptions, newCustomFields);

      // Create complete next state and save React state
      const nextFormData = {
        ...formData,
        ghlCustomFields: updatedMappings as any
      };
      setFormData(nextFormData);
      setMissingCustomFieldsList(missing);

      // 3. Save the mappings automatically (Direct and Secure API)
      const clientPayload = {
        companyName: formData.companyName,
        businessEmail: formData.businessEmail,
        phoneNumber: formData.phoneNumber,
        website: formData.website,
        address: formData.address,
        companyLogo: formData.companyLogo,
        ghlWebhookUrl: formData.ghlWebhookUrl,
        gohighlevelWebhookUrl: formData.ghlWebhookUrl,
        ghlWebhookInstantEstimateSubmitted: formData.ghlWebhookInstantEstimateSubmitted,
        ghlWebhookManualEstimateSent: formData.ghlWebhookManualEstimateSent,
        ghlWebhookEstimateAccepted: formData.ghlWebhookEstimateAccepted,
        ghlWebhookEstimateCompleted: formData.ghlWebhookEstimateCompleted,
        ghlWebhookEstimateDeclined: formData.ghlWebhookEstimateDeclined,
        googleReviewLink: formData.googleReviewLink,
        autoSyncEstimates: formData.autoSyncEstimates,
        ghlLocationId: formData.ghlLocationId,
        ghlInboundWebhookSecret: formData.ghlInboundWebhookSecret,
        ghlPrefillSources: formData.ghlPrefillSources,
        ghlMinChars: formData.ghlMinChars,
        ghlMaxResults: formData.ghlMaxResults,
        enableInstantEstimateWebhook: formData.enableInstantEstimateWebhook,
        suppressInstantEstimateWorkflowExisting: formData.suppressInstantEstimateWorkflowExisting,
        suppressIfEstimateScheduled: formData.suppressIfEstimateScheduled,
        suppressIfEstimateSent: formData.suppressIfEstimateSent,
        suppressIfCustomerAccepted: formData.suppressIfCustomerAccepted,
        suppressIfCustomerCompleted: formData.suppressIfCustomerCompleted,
        allowManualForceTrigger: formData.allowManualForceTrigger,
        enableGhlApiSync: formData.enableGhlApiSync,
        keepGhlLegacyWebhooks: formData.keepGhlLegacyWebhooks,
        ghlPipelineId: formData.ghlPipelineId,
        ghlOpportunityStages: formData.ghlOpportunityStages,
        ghlCustomFields: updatedMappings,
        estimateEmailSubject: formData.estimateEmailSubject,
        estimateEmailBody: formData.estimateEmailBody,
        estimateAcceptedMessage: formData.estimateAcceptedMessage,
        estimateDeclinedMessage: formData.estimateDeclinedMessage,
        updatedAt: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, 'companySettings', 'main'), clientPayload, { merge: true });
      } catch (err) {
        console.error("Auto-save direct firestore error:", err);
      }

      const apiPayload = {
        action: 'save',
        companyName: formData.companyName,
        companyEmail: formData.businessEmail,
        companyPhone: formData.phoneNumber,
        companyWebsite: formData.website,
        companyLogo: formData.companyLogo,
        smtpHost: formData.smtpHost,
        smtpPort: Number(formData.smtpPort),
        smtpSecureType: formData.smtpSecureType,
        smtpUsername: formData.smtpUsername,
        smtpPassword: formData.smtpPassword,
        fromEmail: formData.fromEmail,
        fromName: formData.fromName,
        replyToEmail: formData.replyToEmail,
        gohighlevelWebhookUrl: formData.ghlWebhookUrl,
        ghlWebhookInstantEstimateSubmitted: formData.ghlWebhookInstantEstimateSubmitted,
        ghlWebhookManualEstimateSent: formData.ghlWebhookManualEstimateSent,
        ghlWebhookEstimateAccepted: formData.ghlWebhookEstimateAccepted,
        ghlWebhookEstimateCompleted: formData.ghlWebhookEstimateCompleted,
        ghlWebhookEstimateDeclined: formData.ghlWebhookEstimateDeclined,
        googleReviewLink: formData.googleReviewLink,
        estimateEmailSubject: formData.estimateEmailSubject,
        estimateEmailBody: formData.estimateEmailBody,
        estimateAcceptedMessage: formData.estimateAcceptedMessage,
        estimateDeclinedMessage: formData.estimateDeclinedMessage,
        ghlLocationId: formData.ghlLocationId,
        ghlApiKey: formData.ghlApiKey,
        ghlInboundWebhookSecret: formData.ghlInboundWebhookSecret,
        ghlPrefillSources: formData.ghlPrefillSources,
        ghlMinChars: formData.ghlMinChars,
        ghlMaxResults: formData.ghlMaxResults,
        enableInstantEstimateWebhook: formData.enableInstantEstimateWebhook,
        suppressInstantEstimateWorkflowExisting: formData.suppressInstantEstimateWorkflowExisting,
        suppressIfEstimateScheduled: formData.suppressIfEstimateScheduled,
        suppressIfEstimateSent: formData.suppressIfEstimateSent,
        suppressIfCustomerAccepted: formData.suppressIfCustomerAccepted,
        suppressIfCustomerCompleted: formData.suppressIfCustomerCompleted,
        allowManualForceTrigger: formData.allowManualForceTrigger,
        enableGhlApiSync: formData.enableGhlApiSync,
        keepGhlLegacyWebhooks: formData.keepGhlLegacyWebhooks,
        ghlPipelineId: formData.ghlPipelineId,
        ghlOpportunityStages: formData.ghlOpportunityStages,
        ghlCustomFields: updatedMappings
      };

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(apiPayload)
      });

      if (!response.ok) {
        const resData = await response.json();
        throw new Error(resData.error || 'Failed to save settings to secure server.');
      }

      setAutoConfigSuccess("GoHighLevel custom fields created and mapped successfully.");
      setTimeout(() => setAutoConfigSuccess(null), 8000);
      setShowConfirmCreateCustomFieldsModal(false);
    } catch (err: any) {
      setGhlLoadError(err.message || String(err));
    } finally {
      setIsCreatingFields(false);
    }
  };

  const handleAutoConfigureGhl = async () => {
    setIsAutoConfiguring(true);
    setGhlLoadError(null);
    setAutoConfigSuccess(null);
    try {
      if (!formData.ghlApiKey || !formData.ghlLocationId) {
        throw new Error('Please enter a GoHighLevel API Key and Location ID first.');
      }

      const token = adminToken || localStorage.getItem('company_admin_token');

      // 1. Fetch Pipelines
      const pipeRes = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'ghl-load-pipelines',
          ghlApiKey: formData.ghlApiKey,
          ghlLocationId: formData.ghlLocationId
        })
      });
      const pData = await pipeRes.json();
      if (!pipeRes.ok || pData.success === false) {
        throw new Error(`Pipeline loading failed: ${pData.error || 'Check status'}`);
      }
      
      const retrievedPipelines = pData.pipelines || [];
      setGhlPipelines(retrievedPipelines);

      // Auto select first pipeline if not configured
      let targetPipeline = formData.ghlPipelineId;
      if (!targetPipeline && retrievedPipelines.length > 0) {
        targetPipeline = retrievedPipelines[0].id;
      }

      // Check stages mapping
      let currentStages: Record<string, string> = { ...(formData.ghlOpportunityStages || {}) };
      if (targetPipeline) {
        const matchedPip = retrievedPipelines.find((p: any) => p.id === targetPipeline);
        if (matchedPip && matchedPip.stages && matchedPip.stages.length > 0) {
          const firstStageId = matchedPip.stages[0].id;
          
          const statusKeys = [
            'Interested', 'Appointment Requested', 'Estimate Scheduled', 'Estimate Sent',
            'Accepted', 'Declined', 'Scheduled', 'Completed', 'Archived'
          ];
          
          statusKeys.forEach((key) => {
            if (!currentStages[key]) {
              // Map by name approximation or fallback to first stage
              const matchedStage = matchedPip.stages.find((s: any) => {
                const sName = (s.name || '').toLowerCase().replace(/\s+/g, '');
                const keyNorm = key.toLowerCase().replace(/\s+/g, '');
                return sName.includes(keyNorm) || keyNorm.includes(sName);
              });
              currentStages[key] = matchedStage ? matchedStage.id : firstStageId;
            }
          });
        }
      }

      // 2. Fetch Custom Fields
      const cfRes = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'ghl-load-custom-fields',
          ghlApiKey: formData.ghlApiKey,
          ghlLocationId: formData.ghlLocationId
        })
      });
      const cfData = await cfRes.json();
      if (!cfRes.ok || cfData.success === false) {
        throw new Error(`Custom Fields loading failed: ${cfData.error || 'Check status'}`);
      }
      
      let finalCustomFields = { ...(formData.ghlCustomFields || {}) };
      if (cfData.unsupported) {
        setGhlLoadError('Automatic custom field loading is not currently supported by the GoHighLevel API.');
        setGhlCustomFieldOptions([]);
        setMissingCustomFieldsList([]);
      } else {
        const retrievedFields = cfData.customFields || [];
        setGhlCustomFieldOptions(retrievedFields);

        // 3. Auto-detect & map existing fields
        const { missing, updatedMappings } = checkMissingCustomFields(retrievedFields, formData.ghlCustomFields || {});
        finalCustomFields = { ...updatedMappings };

        // 4. Create missing fields immediately
        if (missing.length > 0) {
          for (const field of missing) {
            const createRes = await fetch('/api/settings', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                action: 'ghl-create-custom-field',
                ghlApiKey: formData.ghlApiKey,
                ghlLocationId: formData.ghlLocationId,
                name: field.label,
                dataType: field.dataType
              })
            });
            const createData = await createRes.json();
            if (createRes.ok && createData.success !== false && createData.customField) {
              finalCustomFields[field.key] = createData.customField.id;
            }
          }

          // Fetch refreshed field options
          const refetchRes = await fetch('/api/settings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              action: 'ghl-load-custom-fields',
              ghlApiKey: formData.ghlApiKey,
              ghlLocationId: formData.ghlLocationId
            })
          });
          const refetchData = await refetchRes.json();
          if (refetchRes.ok && refetchData.success) {
            setGhlCustomFieldOptions(refetchData.customFields || []);
          }
          setMissingCustomFieldsList([]);
        }
      }

      // 5. Update complete state
      const nextFormData = {
        ...formData,
        ghlPipelineId: targetPipeline,
        ghlOpportunityStages: currentStages as any,
        ghlCustomFields: finalCustomFields as any
      };
      setFormData(nextFormData);

      // 6. Save directly to Firestore settings document
      const saveRes = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'save',
          ...nextFormData
        })
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || saveData.success === false) {
        throw new Error(saveData.error || 'Failed saving your configured settings.');
      }

      setAutoConfigSuccess('✓ GoHighLevel configuration completed successfully.');
      setTimeout(() => setAutoConfigSuccess(null), 8000);

      // Update external diagnostic counters
      setIsTestingDiagnostic(true);
      const diagRes = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'ghl-full-diagnostic' })
      });
      const diagData = await diagRes.json();
      setDiagnosticResult(diagData);
      setIsTestingDiagnostic(false);
    } catch (err: any) {
      setGhlLoadError(err.message || String(err));
    } finally {
      setIsAutoConfiguring(false);
    }
  };

  const handleRunApiSyncTest = async () => {
    setIsTestingApiSync(true);
    setTestApiSyncResult(null);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'test-ghl-api-sync',
          ghlApiKey: formData.ghlApiKey,
          ghlLocationId: formData.ghlLocationId,
          ghlPipelineId: formData.ghlPipelineId,
          ghlOpportunityStages: formData.ghlOpportunityStages,
          ghlCustomFields: formData.ghlCustomFields
        })
      });
      const data = await response.json();
      setTestApiSyncResult(data);
    } catch (err: any) {
      setTestApiSyncResult({
        success: false,
        message: 'FAIL: Outermost diagnostic system rejection.',
        error: err.message || String(err)
      });
    } finally {
      setIsTestingApiSync(false);
    }
  };

  const handleRunDiagnostic = async () => {
    setIsTestingDiagnostic(true);
    setDiagnosticResult(null);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: 'ghl-full-diagnostic' })
      });
      const data = await response.json();
      setDiagnosticResult(data);
    } catch (err: any) {
      setDiagnosticResult({ success: false, error: err.message || String(err) });
    } finally {
      setIsTestingDiagnostic(false);
    }
  };

  const handleCheckDuplicate = async () => {
    setIsCheckingDuplicate(true);
    setCheckDuplicateResult(null);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'check-ghl-duplicate-contact',
          name: dupForm.name,
          email: dupForm.email,
          phone: dupForm.phone
        })
      });
      const data = await response.json();
      setCheckDuplicateResult(data);
    } catch (err: any) {
      setCheckDuplicateResult({ success: false, error: err.message || String(err) });
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  const handlePrefillSearch = async () => {
    if (!prefillQuery.trim()) return;
    setIsTestingPrefillQuery(true);
    setPrefillResults([]);
    try {
      const response = await fetch('/api/estimates/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search-customer-prefill',
          query: prefillQuery
        })
      });
      const data = await response.json();
      if (data.success && Array.isArray(data.suggestions)) {
        setPrefillResults(data.suggestions);
      } else {
        setPrefillResults([]);
      }
    } catch (err) {
      console.warn("Failed prefill search simulation:", err);
    } finally {
      setIsTestingPrefillQuery(false);
    }
  };

  const fetchGhlIntegrationStatus = async () => {
    setIsFetchStatusLoading(true);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      if (token) {
        const response = await fetch('/api/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ action: 'ghl-integration-status' })
        });
        if (response.ok) {
          const resData = await response.json();
          if (resData.success) {
            setGhlStatus(resData);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch GHL live details:", err);
    } finally {
      setIsFetchStatusLoading(false);
    }
  };

  React.useEffect(() => {
    if (activeSection === 'integration') {
      fetchGhlIntegrationStatus();
    }
  }, [activeSection, adminToken]);

  const handleGenerateSecret = () => {
    const array = new Uint8Array(24);
    window.crypto.getRandomValues(array);
    const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    setFormData(prev => ({
      ...prev,
      ghlInboundWebhookSecret: hex
    }));
  };

  const handleCopyText = (text: string, setCopiedState: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  const handleTestOutbound = async () => {
    setIsTestingOutbound(true);
    setTestOutboundResult(null);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'test-ghl-outbound',
          ghlWebhookUrl: formData.ghlWebhookUrl
        })
      });
      const data = await response.json();
      setTestOutboundResult(data);
    } catch (err: any) {
      setTestOutboundResult({ success: false, error: err.message || String(err) });
    } finally {
      setIsTestingOutbound(false);
    }
  };

  const handleTestInbound = async () => {
    setIsTestingInbound(true);
    setTestInboundResult(null);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'test-ghl-inbound',
          secret: formData.ghlInboundWebhookSecret
        })
      });
      const data = await response.json();
      setTestInboundResult(data);
      setTimeout(() => {
        fetchGhlIntegrationStatus();
      }, 1200);
    } catch (err: any) {
      setTestInboundResult({ success: false, error: err.message || String(err) });
    } finally {
      setIsTestingInbound(false);
    }
  };

  const handlePrefillSourcesChange = (source: string) => {
    const current = formData.ghlPrefillSources || [];
    let updated;
    if (current.includes(source)) {
      updated = current.filter(s => s !== source);
    } else {
      updated = [...current, source];
    }
    setFormData(prev => ({
      ...prev,
      ghlPrefillSources: updated
    }));
  };

  // SMTP Test pipeline dispatcher
  const handleSendTestEmail = async () => {
    setTestError(null);
    setTestSuccess(null);
    if (!testRecipient) {
      setTestError('A valid test recipient email address is required.');
      return;
    }

    setIsSendingTest(true);
    try {
      const token = adminToken || localStorage.getItem('company_admin_token');
      if (!token) {
        throw new Error('Authentication is required to run secure SMTP connection diagnostic tests.');
      }

      const payload = {
        action: 'test-email',
        emailProvider: formData.emailProvider,
        resendApiKey: formData.resendApiKey,
        smtpHost: formData.smtpHost,
        smtpPort: Number(formData.smtpPort),
        smtpSecureType: formData.smtpSecureType,
        smtpUsername: formData.smtpUsername,
        smtpPassword: formData.smtpPassword,
        fromEmail: formData.fromEmail,
        fromName: formData.fromName,
        recipientEmail: testRecipient
      };

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      // Avoid blindly calling response.json() on potential plain-text/HTML/Vercel server errors
      const contentType = response.headers.get('content-type');
      let resData: any = null;

      if (contentType && contentType.includes('application/json')) {
        try {
          resData = await response.json();
        } catch (jsonErr) {
          throw new Error('Server returned a non-JSON error. Check Vercel logs.');
        }
      } else {
        throw new Error('Server returned a non-JSON error. Check Vercel logs.');
      }

      if (!response.ok) {
        if (resData && typeof resData === 'object') {
          throw new Error(JSON.stringify(resData, null, 2));
        }
        throw new Error(resData?.error || 'SMTP Connection Test failed.');
      }

      // Display successfully verified JSON metadata cleanly
      setTestSuccess(JSON.stringify(resData, null, 2));
    } catch (err: any) {
      setTestError(err.message || 'Fatal communications error with SMTP validation server.');
    } finally {
      setIsSendingTest(false);
    }
  };

  const sections = [
    { id: 'company', label: 'Company Profile', icon: Building2 },
    { id: 'integration', label: 'CRM & Integrations', icon: Webhook },
    { id: 'smtp', label: 'SMTP Mail Server', icon: Mail },
    { id: 'templates', label: 'Email Templates', icon: Settings2 },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ];

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <RefreshCw className="animate-spin text-american-blue" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter text-american-blue font-sans">Settings</h1>
          <p className="text-[#666666] mt-2">Configure your business profile, SMTP servers, and external CRM integrations.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 rounded-xl bg-american-blue px-6 py-3 text-sm font-bold text-white hover:bg-american-blue/90 transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
          Save Changes
        </button>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl text-xs font-bold flex items-start gap-2 shadow-sm">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Sidebar Nav */}
        <div className="lg:col-span-3 space-y-2">
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id as any)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                activeSection === s.id ? "bg-american-blue text-white shadow-md" : "text-[#666666] hover:bg-white hover:shadow-sm hover:text-american-blue"
              )}
            >
              <s.icon size={18} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl p-8 border border-[#E5E5E5] shadow-sm space-y-8"
          >
            {activeSection === 'company' && (
              <div className="space-y-8">
                <div className="flex items-center gap-6">
                  <div className="h-24 w-24 rounded-3xl bg-white border-2 border-american-blue/20 flex flex-col items-center justify-center text-[#999999] cursor-pointer hover:border-american-blue transition-all overflow-hidden shadow-sm">
                    {formData.companyLogo || COMPANY_INFO.logo ? (
                      <img src={formData.companyLogo || COMPANY_INFO.logo} alt="Logo" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
                    ) : (
                      <>
                        <ImageIcon size={24} />
                        <span className="text-[10px] font-bold mt-1">Logo</span>
                      </>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">Company Branding</h3>
                    <p className="text-sm text-[#666666]">This logo will appear on customer signature portals and estimate contracts.</p>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Company Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="text" 
                        value={formData.companyName} 
                        onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Business Email</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="email" 
                        value={formData.businessEmail} 
                        onChange={(e) => setFormData({...formData, businessEmail: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="tel" 
                        value={formData.phoneNumber} 
                        onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Website</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="url" 
                        value={formData.website} 
                        onChange={(e) => setFormData({...formData, website: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Company Logo URL</label>
                    <div className="relative">
                      <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="text" 
                        placeholder="https://mysite.com/logo.png"
                        value={formData.companyLogo} 
                        onChange={(e) => setFormData({...formData, companyLogo: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm font-sans focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">Business Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="text" 
                        value={formData.address} 
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'integration' && (
              <div className="space-y-8 animate-fade-in">
                {/* Header Banner */}
                <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 flex gap-4">
                  <ShieldCheck className="text-blue-600 shrink-0" size={24} />
                  <div>
                    <h4 className="text-sm font-bold text-blue-900">CRM & GoHighLevel Integration Hub</h4>
                    <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                      Manage dual-synchronization, webhook log analysis, duplicate protection rules, scheduler links, and lead-prefill lookups from this command board.
                    </p>
                  </div>
                </div>

                {/* Integration Status Card */}
                <div className="p-6 rounded-2xl border border-slate-200 bg-slate-50 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Integration Connection Status</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Real-time health of your LeadConnector connection</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {formData.ghlApiKey && formData.ghlLocationId ? (
                        <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Connected & Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full">
                          <span className="h-2 w-2 rounded-full bg-amber-500" /> Pending Credentials
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Stat 1 */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 flex flex-col justify-between">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Pipelines & Stages</p>
                      <p className="text-lg font-bold text-slate-800 mt-1">
                        {formData.ghlPipelineId ? "Pipeline Active" : "No Pipeline Selected"}
                      </p>
                      <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                        <span>Opportunity stages mapped:</span>
                        <span className="font-bold text-slate-700">
                          {Object.values(formData.ghlOpportunityStages || {}).filter(Boolean).length} / 9
                        </span>
                      </div>
                    </div>

                    {/* Stat 2 */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 flex flex-col justify-between">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Contact Custom Fields</p>
                      <p className="text-lg font-bold text-slate-800 mt-1">
                        {missingCustomFieldsList.length === 0 ? "Fully Configured" : `${missingCustomFieldsList.length} Fields Missing`}
                      </p>
                      <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
                        <span>Fields created & mapped:</span>
                        <span className="font-bold text-slate-700">
                          {13 - missingCustomFieldsList.length} / 13
                        </span>
                      </div>
                    </div>

                    {/* Stat 3 */}
                    <div className="p-4 bg-white rounded-xl border border-slate-200 flex flex-col justify-between">
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Direct API Sync</p>
                      <p className="text-lg font-bold text-slate-800 mt-1">
                        {formData.enableGhlApiSync ? "ENABLED" : "DISABLED"}
                      </p>
                      <div className="mt-2 text-xs text-[#0f533a] bg-emerald-50 px-2 py-0.5 rounded text-center font-bold">
                        Outbound Sync Ready
                      </div>
                    </div>
                  </div>

                  {/* Troubleshooting Guidance Checklist */}
                  <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Integration Health Checklist</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        {formData.ghlLocationId ? (
                          <Check className="text-emerald-500 shrink-0" size={14} />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                        )}
                        <span className={formData.ghlLocationId ? "text-slate-600 line-through font-normal" : "text-slate-700 font-medium"}>
                          Provide valid Location ID
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {formData.ghlApiKey && formData.ghlApiKey !== '••••••••' ? (
                          <Check className="text-emerald-500 shrink-0" size={14} />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                        )}
                        <span className={formData.ghlApiKey ? "text-slate-600 line-through font-normal" : "text-slate-700 font-medium"}>
                          Provide valid GHL API Key
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {formData.ghlPipelineId ? (
                          <Check className="text-emerald-500 shrink-0" size={14} />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                        )}
                        <span className={formData.ghlPipelineId ? "text-slate-600 line-through font-normal" : "text-slate-700 font-medium"}>
                          Select and save CRM Pipeline
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {Object.values(formData.ghlOpportunityStages || {}).filter(Boolean).length >= 5 ? (
                          <Check className="text-emerald-500 shrink-0" size={14} />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                        )}
                        <span className={Object.values(formData.ghlOpportunityStages || {}).filter(Boolean).length >= 5 ? "text-slate-600 line-through font-normal" : "text-slate-700 font-medium"}>
                          Map basic pipeline opportunity stages
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {missingCustomFieldsList.length === 0 ? (
                          <Check className="text-emerald-500 shrink-0" size={14} />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                        )}
                        <span className={missingCustomFieldsList.length === 0 ? "text-slate-600 line-through font-normal" : "text-slate-700 font-medium"}>
                          Ensure contact custom fields are created & mapped
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {formData.ghlInboundWebhookSecret ? (
                          <Check className="text-emerald-500 shrink-0" size={14} />
                        ) : (
                          <div className="h-4 w-4 rounded-full border border-slate-300 shrink-0" />
                        )}
                        <span className={formData.ghlInboundWebhookSecret ? "text-slate-600 line-through font-normal" : "text-slate-700 font-medium"}>
                          Shared webhook signature secret configured
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 1: Connection Settings */}
                <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-6">
                  <div className="flex items-center justify-between border-b border-[#F2F2F2] pb-3">
                    <div className="flex items-center gap-2">
                      <Key className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">CRM Credentials & Secrets</h4>
                    </div>
                    <span className="text-[10px] text-[#666666] font-medium bg-[#F5F5F5] px-2 py-0.5 rounded">Secure Admin Storage</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#666666] flex items-center gap-1">
                        GoHighLevel Location ID
                      </label>
                      <input 
                        type="text" 
                        placeholder="e.g. z9XmKdf89oLpjKws87sH"
                        value={formData.ghlLocationId}
                        onChange={(e) => setFormData({...formData, ghlLocationId: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                      <p className="text-[10px] text-[#999999]">Required to anchor duplicate matching logic to your specific CRM agency node.</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#666666] flex items-center gap-1">
                        API Key / Bearer Token
                      </label>
                      <div className="relative">
                        <input 
                          type={showApiKey ? "text" : "password"} 
                          placeholder="••••••••••••••••"
                          value={formData.ghlApiKey}
                          onChange={(e) => setFormData({...formData, ghlApiKey: e.target.value})}
                          className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] pl-4 pr-12 py-3 text-sm font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                        />
                        <button 
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-[#999999] hover:text-[#333333] transition-colors"
                        >
                          {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p className="text-[10px] text-[#999999]">Never shared with client interfaces. Authorized strictly for server-side CRM query requests.</p>
                    </div>
                  </div>

                  {/* Generate Inbound Secret */}
                  <div className="pt-4 border-t border-[#F2F2F2] space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666] block">
                      Inbound Webhook Shared Verification Secret
                    </label>
                    <div className="xl:flex gap-3">
                      <div className="relative flex-1">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                        <input 
                          type="text" 
                          placeholder="Generate or input a strong webhook signature secret"
                          value={formData.ghlInboundWebhookSecret}
                          onChange={(e) => setFormData({...formData, ghlInboundWebhookSecret: e.target.value})}
                          className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                        />
                      </div>
                      <div className="flex gap-2 mt-3 xl:mt-0 shrink-0">
                        <button
                          type="button"
                          onClick={handleGenerateSecret}
                          className="px-4 py-3 rounded-xl bg-[#F5F5F5] hover:bg-[#EAEAEA] text-[#333333] font-bold text-xs flex items-center gap-1.5 transition-all"
                        >
                          <RefreshCw size={14} /> Generate Secret
                        </button>
                        <button
                          type="button"
                          disabled={!formData.ghlInboundWebhookSecret}
                          onClick={() => handleCopyText(formData.ghlInboundWebhookSecret, setCopiedSecret)}
                          className="px-4 py-3 rounded-xl bg-american-blue text-white font-bold text-xs flex items-center gap-1.5 hover:bg-[#1a2c4e] transition-all disabled:opacity-50"
                        >
                          <Copy size={14} /> {copiedSecret ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-[#999999]">Matches incoming "x-lsfw-webhook-secret" header or "?secret=" query parameter to secure webhook execution.</p>
                  </div>
                </div>

                {/* Section 2: Direct GHL API Synchronization & Custom Field Mapping */}
                <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-6">
                  <div className="flex items-center justify-between border-b border-[#F2F2F2] pb-3">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="text-american-blue animate-spin-slow" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Direct GoHighLevel API Sync Layer</h4>
                    </div>
                    <span className="text-[10px] text-[#0f533a] bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-bold uppercase select-none">Direct Connection</span>
                  </div>

                  <p className="text-xs text-[#666666] leading-relaxed">
                    By bypassing loose webhooks and communicating directly with your CRM, the system creates/updates contacts, updates tags dynamically, maps system fields to GHL custom fields, and moves opportunities to exact pipeline stages securely.
                  </p>

                  {/* Automation & Dynamic Setup Control Card */}
                  <div className="flex flex-col sm:flex-row gap-3 p-4 bg-slate-50 rounded-xl border border-[#E5E5E5]">
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-bold text-slate-800">Automate GoHighLevel Setup</p>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Clicking below automatically validates credentials, fetches pipelines, configures stages, creates missing contact custom fields, and saves settings.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0 justify-center items-center">
                      <button
                        type="button"
                        onClick={handleAutoConfigureGhl}
                        disabled={isAutoConfiguring || !formData.ghlApiKey || !formData.ghlApiKey.trim() || !formData.ghlLocationId || !formData.ghlLocationId.trim()}
                        className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 select-none shadow-sm cursor-pointer"
                      >
                        {isAutoConfiguring ? (
                          <>
                            <RefreshCw className="animate-spin" size={12} /> Configuring...
                          </>
                        ) : (
                          <>
                            <Sparkles size={12} /> Configure GoHighLevel Automatically
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLoadGhlData(false)}
                        disabled={isLoadingGhlData || !formData.ghlApiKey || !formData.ghlLocationId}
                        className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-[#E5E5E5] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 select-none cursor-pointer"
                      >
                        {isLoadingGhlData ? (
                          <>
                            <RefreshCw className="animate-spin" size={12} /> Loading...
                          </>
                        ) : (
                          <>
                            <RefreshCw size={12} /> Load GoHighLevel Data
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {autoConfigSuccess && (
                     <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                       <Check size={14} className="text-emerald-600" />
                       {autoConfigSuccess}
                     </div>
                  )}

                  {ghlLoadError && (
                     <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex flex-col gap-1">
                       <div className="flex items-center gap-2 font-bold">
                         <AlertCircle size={14} className="text-rose-600" />
                         <span>GoHighLevel Connection Issue</span>
                       </div>
                       <p className="font-mono text-[10px] text-rose-700">{ghlLoadError}</p>
                     </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Toggle: Enable GHL API Sync */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="space-y-0.5 pr-2">
                        <label className="text-xs font-bold text-gray-800">Use Direct GHL API Sync</label>
                        <p className="text-[10px] text-gray-500">Enable real-time, bi-directional direct contact & opportunity updates.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, enableGhlApiSync: !formData.enableGhlApiSync})}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                          formData.enableGhlApiSync ? "bg-emerald-600" : "bg-gray-200"
                        )}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          formData.enableGhlApiSync ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>

                    {/* Toggle: Suppress background legacy webhooks */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="space-y-0.5 pr-2">
                        <label className="text-xs font-bold text-gray-800">Continue Outbound Legacy Webhooks</label>
                        <p className="text-[10px] text-gray-500">Keep legacy outbound webhook workflow blocks firing in parallel.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, keepGhlLegacyWebhooks: !formData.keepGhlLegacyWebhooks})}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                          formData.keepGhlLegacyWebhooks ? "bg-blue-600" : "bg-gray-200"
                        )}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          formData.keepGhlLegacyWebhooks ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">
                      GHL Opportunity Pipeline
                    </label>
                    {ghlPipelines && ghlPipelines.length > 0 ? (
                      <select
                        value={formData.ghlPipelineId}
                        onChange={(e) => setFormData({...formData, ghlPipelineId: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-3 text-sm font-sans focus:border-american-blue focus:outline-none focus:bg-white transition-all cursor-pointer"
                      >
                        <option value="">-- Select GoHighLevel Pipeline --</option>
                        {ghlPipelines.map((pipeline: any) => (
                          <option key={pipeline.id} value={pipeline.id}>
                            {pipeline.name} (ID: {pipeline.id})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="e.g. pL9nMb8R7qS3tYw2vXz0"
                          value={formData.ghlPipelineId}
                          onChange={(e) => setFormData({...formData, ghlPipelineId: e.target.value})}
                          className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                        />
                        <p className="text-[10px] text-amber-600 mt-1">
                          No active GHL pipelines loaded. Click "Load GoHighLevel Data" or type custom ID manual mapping above.
                        </p>
                      </div>
                    )}
                    <p className="text-[10px] text-[#999999]">Required to auto-create and move opportunities to correct pipeline stages during job transitions.</p>
                  </div>

                  {/* Stage Mapping Grid */}
                  <div className="border-t border-[#F2F2F2] pt-4 space-y-4">
                    <div>
                      <h4 className="text-xs font-bold text-[#333333] uppercase tracking-wider">Opportunity Pipeline Stage IDs Mapping</h4>
                      <p className="text-[10px] text-[#666666] leading-relaxed mt-0.5">Map system statuses to their corresponding stage IDs in your GoHighLevel Pipeline.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.keys(formData.ghlOpportunityStages).map((stageKey) => {
                        // Find current selected pipeline's stages if any
                        const selectedPip = ghlPipelines.find(p => p.id === formData.ghlPipelineId);
                        const availableStages = selectedPip ? selectedPip.stages || [] : [];

                        return (
                          <div key={stageKey} className="space-y-1">
                            <label className="text-[10px] font-bold text-[#666666] uppercase tracking-wide">{stageKey} Stage</label>
                            {availableStages.length > 0 ? (
                              <select
                                value={(formData.ghlOpportunityStages as any)[stageKey] || ''}
                                onChange={(e) => {
                                  const updatedStages = { ...formData.ghlOpportunityStages, [stageKey]: e.target.value };
                                  setFormData({ ...formData, ghlOpportunityStages: updatedStages });
                                }}
                                className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-sans focus:border-american-blue focus:outline-none focus:bg-white transition-all cursor-pointer"
                              >
                                <option value="">-- Select Stage --</option>
                                {availableStages.map((stage: any) => (
                                  <option key={stage.id} value={stage.id}>
                                    {stage.name} (ID: {stage.id})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input 
                                type="text" 
                                placeholder="Stage ID"
                                value={(formData.ghlOpportunityStages as any)[stageKey] || ''}
                                onChange={(e) => {
                                  const updatedStages = { ...formData.ghlOpportunityStages, [stageKey]: e.target.value };
                                  setFormData({ ...formData, ghlOpportunityStages: updatedStages });
                                }}
                                className="w-full rounded-lg border border-[#E5E5E5] bg-[#F9F9F9] px-3 py-2 text-xs font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Field Mapping Grid */}
                  <div className="border-t border-[#F2F2F2] pt-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-[#333333] uppercase tracking-wider">GoHighLevel Contact Custom Fields Mapping</h4>
                        <p className="text-[10px] text-[#666666] leading-relaxed mt-0.5">
                          Select the GHL Custom Field from the dropdown list. If a custom field is missing, you can create it below automatically.
                        </p>
                      </div>
                      
                      {missingCustomFieldsList.length > 0 && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[10px] text-amber-900 leading-normal shrink-0">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertCircle size={12} className="text-amber-600 animate-pulse" />
                            <span>{missingCustomFieldsList.length} Fields Missing in GoHighLevel</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowConfirmCreateCustomFieldsModal(true)}
                            disabled={isCreatingFields}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-2.5 py-1 rounded text-[9px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            {isCreatingFields ? (
                              <>
                                <RefreshCw className="animate-spin" size={10} /> Creating...
                              </>
                            ) : (
                              'Create Missing Fields'
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[
                        { key: 'estimateId', label: 'Estimate ID' },
                        { key: 'estimateNumber', label: 'Estimate Number' },
                        { key: 'estimateLink', label: 'Estimate Contract Link' },
                        { key: 'estimatedPrice', label: 'Estimated Total' },
                        { key: 'fenceType', label: 'Fence Type' },
                        { key: 'linearFeet', label: 'Linear Feet' },
                        { key: 'jobStatus', label: 'Job Status' },
                        { key: 'customerEstimatorSubmittedAt', label: 'Estimator Submitted Date' },
                        { key: 'lastEstimateSentAt', label: 'Last Estimate Sent Date' },
                        { key: 'acceptedAt', label: 'Contract Accepted Date' },
                        { key: 'declinedAt', label: 'Contract Declined Date' },
                        { key: 'scheduledStartDate', label: 'Project Scheduled Start Date' },
                        { key: 'completedAt', label: 'Project Completed Date' },
                        { key: 'minimumInstallDate', label: 'Minimum Install Lead Date' },
                        { key: 'customerName', label: 'Customer Name (Custom Field)' },
                        { key: 'address', label: 'Customer Address (Custom Field)' }
                      ].map((mapping) => {
                        const isMissing = missingCustomFieldsList.some((item) => item.key === mapping.key);
                        
                        return (
                          <div key={mapping.key} className="space-y-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <label className="text-[10px] font-bold text-[#666666] uppercase tracking-wide">{mapping.label}</label>
                              {isMissing && (
                                <span className="text-[8px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  ⚠ Missing in GoHighLevel
                                </span>
                              )}
                            </div>
                            
                            {ghlCustomFieldOptions && ghlCustomFieldOptions.length > 0 ? (
                              <select
                                value={(formData.ghlCustomFields as any)[mapping.key] || ''}
                                onChange={(e) => {
                                  const updatedFields = { ...formData.ghlCustomFields, [mapping.key]: e.target.value };
                                  setFormData({ ...formData, ghlCustomFields: updatedFields });
                                }}
                                className="w-full rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-xs font-sans focus:border-american-blue focus:outline-none focus:bg-white transition-all cursor-pointer"
                              >
                                <option value="">-- Select custom field --</option>
                                {ghlCustomFieldOptions.map((opt: any) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.name} ({opt.dataType || opt.type || 'TEXT'})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input 
                                type="text" 
                                placeholder="GHL Field ID or Key"
                                value={(formData.ghlCustomFields as any)[mapping.key] || ''}
                                onChange={(e) => {
                                  const updatedFields = { ...formData.ghlCustomFields, [mapping.key]: e.target.value };
                                  setFormData({ ...formData, ghlCustomFields: updatedFields });
                                }}
                                className="w-full rounded-lg border border-[#E5E5E5] bg-[#F9F9F9] px-3 py-2 text-xs font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Section 2.5: GoHighLevel Calendar & Installation Scheduler Integration */}
                <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-6">
                  <div className="flex items-center justify-between border-b border-[#F2F2F2] pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Installation Calendar & Scheduler</h4>
                    </div>
                  </div>

                  <div className="text-xs text-gray-600 leading-relaxed space-y-2">
                    <p>
                      GoHighLevel serves as the primary system of record for installation booking and customer reminders.
                      When a customer accepts an estimate, they are tagged with <code className="bg-slate-100 px-1 py-0.5 rounded text-[#ef4444] font-bold">estimate-accepted</code>.
                      You can trigger a GHL automation workflow to present them with your scheduler calendar.
                    </p>
                    <p>
                      Once the customer selects an appointment slot, GHL fires a webhook back to this app at the target inbound URL,
                      and the system automatically updates the internal estimate status, records history logging, and triggers crew dispatches.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Toggle: enableGhlCalendarPrimaryScheduler */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="space-y-0.5 pr-2">
                        <label className="text-xs font-bold text-gray-800">Enable GHL Calendar as Primary Scheduler</label>
                        <p className="text-[10px] text-gray-500">Bypass local scheduling and route customers entirely to GHL Booking Form.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, enableGhlCalendarPrimaryScheduler: !formData.enableGhlCalendarPrimaryScheduler})}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                          formData.enableGhlCalendarPrimaryScheduler ? "bg-emerald-600" : "bg-gray-200"
                        )}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          formData.enableGhlCalendarPrimaryScheduler ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>

                    {/* Toggle: sendCrewEmailAfterGhlInstallBooking */}
                    <div className="flex flex-col gap-3 p-4 rounded-xl bg-gray-50 border border-gray-100 justify-between">
                      <div className="flex items-center justify-between w-full">
                        <div className="space-y-0.5 pr-2">
                          <label className="text-xs font-bold text-gray-800">Send Crew Email After GHL Booking</label>
                          <p className="text-[10px] text-gray-500">Automatically dispatch job parameters & crew payouts once GHL registers booking.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData({...formData, sendCrewEmailAfterGhlInstallBooking: !formData.sendCrewEmailAfterGhlInstallBooking})}
                          className={cn(
                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                            formData.sendCrewEmailAfterGhlInstallBooking ? "bg-emerald-600" : "bg-gray-200"
                          )}
                        >
                          <span className={cn(
                            "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            formData.sendCrewEmailAfterGhlInstallBooking ? "translate-x-5" : "translate-x-0"
                          )} />
                        </button>
                      </div>

                      {formData.sendCrewEmailAfterGhlInstallBooking && !primaryCrewEmail && (
                        <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 text-[10px] font-semibold text-amber-800 flex items-start gap-1.5 mt-1">
                          <span className="text-xs">🚨</span>
                          <div>
                            <p className="leading-snug">
                              <strong>Primary Contact Warning:</strong> Automated Crew Dispatch is enabled, but no Primary Crew Contact is configured in <strong>Manage Employees</strong>. Messages will fall back to admin email.
                            </p>
                          </div>
                        </div>
                      )}

                      {formData.sendCrewEmailAfterGhlInstallBooking && primaryCrewEmail && (
                        <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-100 text-[10px] font-bold text-emerald-800 flex items-start gap-1.5 mt-1">
                          <span className="text-xs">★</span>
                          <div>
                            <p className="leading-snug">
                              Primary Crew Contact: <strong>{primaryCrewName || 'Unnamed Crew'}</strong> ({primaryCrewEmail}). System will auto-dispatch to this address.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Toggle: sendAdminBackupEmail */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="space-y-0.5 pr-2">
                        <label className="text-xs font-bold text-gray-800">Send Admin Backup Email</label>
                        <p className="text-[10px] text-gray-500">Send a backup CC copy of the crew installation dispatch to the admin notification email address.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, sendAdminBackupEmail: !formData.sendAdminBackupEmail})}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                          formData.sendAdminBackupEmail ? "bg-emerald-600" : "bg-gray-200"
                        )}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          formData.sendAdminBackupEmail ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>

                    {/* Toggle: requireEstimateIdMatching */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="space-y-0.5 pr-2">
                        <label className="text-xs font-bold text-gray-800">Require estimateId matching</label>
                        <p className="text-[10px] text-gray-500">Strict mode: Webhooks without a valid `estimateId` will trigger a matching failure block.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, requireEstimateIdMatching: !formData.requireEstimateIdMatching})}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                          formData.requireEstimateIdMatching ? "bg-amber-600" : "bg-gray-200"
                        )}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          formData.requireEstimateIdMatching ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>

                    {/* Toggle: allowFallbackMatching */}
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="space-y-0.5 pr-2">
                        <label className="text-xs font-bold text-gray-800">Allow fallback matching by email/phone</label>
                        <p className="text-[10px] text-gray-500">Fallback mode: Search matching estimates by GHL Contact ID, Email address, or Phone numbers.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, allowFallbackMatching: !formData.allowFallbackMatching})}
                        className={cn(
                          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                          formData.allowFallbackMatching ? "bg-emerald-600" : "bg-gray-200"
                        )}
                      >
                        <span className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          formData.allowFallbackMatching ? "translate-x-5" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Input: ghlInstallCalendarId */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">
                        GHL Install Calendar ID
                      </label>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                        <input 
                          type="text" 
                          placeholder="e.g. ghl_calendar_12345"
                          value={formData.ghlInstallCalendarId || ''}
                          onChange={(e) => setFormData({...formData, ghlInstallCalendarId: e.target.value})}
                          className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                        />
                      </div>
                      <p className="text-[10px] text-[#999999]">Optional calendar target tag to track inside schedule logs mapping details.</p>
                    </div>

                    {/* Input: minimumInstallLeadDays */}
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">
                        Minimum Install Lead Days
                      </label>
                      <div className="relative">
                        <input 
                          type="number" 
                          min="1"
                          max="30"
                          value={formData.minimumInstallLeadDays || 4}
                          onChange={(e) => setFormData({...formData, minimumInstallLeadDays: Number(e.target.value)})}
                          className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-4 py-3 text-sm font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                        />
                      </div>
                      <p className="text-[10px] text-[#999999]">Used to restrict lead time mapping window boundaries for custom automation tags. Recommended default is 4.</p>
                    </div>
                  </div>

                  {/* GHL Calendar Diagnostic / Troubleshooting Panel */}
                  <div className="mt-4 p-4 rounded-xl border border-rose-100 bg-rose-50/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="text-rose-500" size={16} />
                        <h5 className="text-xs font-black uppercase tracking-tight text-rose-700">Sync Diagnostic & Slot Troubleshooting</h5>
                      </div>
                      <button 
                        type="button"
                        onClick={async () => {
                          setIsTestingDiagnostic(true);
                          setDiagnosticResult(null);
                          try {
                            const token = adminToken || localStorage.getItem('company_admin_token');
                            const res = await fetch('/api/settings', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                              },
                              body: JSON.stringify({
                                action: 'ghl-test-calendar-slots',
                                ghlApiKey: formData.ghlApiKey,
                                ghlLocationId: formData.ghlLocationId,
                                calendarId: formData.ghlInstallCalendarId || 'mLZAlEmZ3Y2QyByYTFQh'
                              })
                            });
                            const data = await res.json();
                            setDiagnosticResult(data);
                          } catch (err: any) {
                            setDiagnosticResult({ success: false, error: err.message });
                          } finally {
                            setIsTestingDiagnostic(false);
                          }
                        }}
                        disabled={isTestingDiagnostic || !formData.ghlApiKey}
                        className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-600 text-[10px] font-black uppercase border border-rose-200 rounded-lg shadow-sm transition-all disabled:opacity-50"
                      >
                        {isTestingDiagnostic ? "Checking..." : "Verify Slot Connectivity"}
                      </button>
                    </div>
                    
                    <p className="text-[10px] text-rose-600/70 leading-relaxed">
                      This diagnostic checks if your API Key and Location ID have permission to read the selected Calendar's availability. GHL requires a 4-day scheduling buffer and active availability rules.
                    </p>

                    {diagnosticResult && (
                      <div className="mt-3 space-y-4">
                        {/* Validation Checklist */}
                        <div className="p-3 bg-white rounded-lg border border-slate-100 space-y-2">
                          <h6 className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-2">Pre-flight Validation</h6>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            {[
                              { label: 'Calendar ID', valid: diagnosticResult.validation?.calendarId },
                              { label: 'API Token', valid: diagnosticResult.validation?.apiKey },
                              { label: 'Location ID', valid: diagnosticResult.validation?.locationId },
                              { label: 'Timezone', valid: diagnosticResult.validation?.timezone },
                              { label: 'Endpoint Format', valid: diagnosticResult.validation?.endpoint },
                              { label: 'HTTP Method', valid: diagnosticResult.validation?.method },
                            ].map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                {item.valid ? (
                                  <CheckCircle2 size={10} className="text-emerald-500" />
                                ) : (
                                  <XCircle size={10} className="text-rose-500" />
                                )}
                                <span className={cn(
                                  "text-[10px] font-medium",
                                  item.valid ? "text-slate-600" : "text-rose-500"
                                )}>{item.label}</span>
                              </div>
                            ))}
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-50 space-y-2">
                            <h6 className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Parser Result</h6>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500">Parsed Slot Count:</span>
                              <span className={cn(
                                "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                diagnosticResult.parsedSlotCount > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                              )}>
                                {diagnosticResult.parsedSlotCount || 0}
                              </span>
                            </div>
                            {diagnosticResult.parsedSlots && diagnosticResult.parsedSlots.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-400">Parsed Slots:</span>
                                <div className="max-h-24 overflow-y-auto p-2 bg-slate-50 rounded border border-slate-100">
                                  {diagnosticResult.parsedSlots.map((s: string, idx: number) => (
                                    <div key={idx} className="text-[9px] font-mono text-slate-600 border-b border-slate-200/50 py-0.5 last:border-0">
                                      {s}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Developer Debug View */}
                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-hidden">
                          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                              <Terminal size={12} className="text-emerald-400" />
                              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Developer Debug Mode</span>
                            </div>
                            {diagnosticResult.debug?.response?.responseTime && (
                              <span className="text-[9px] font-mono text-slate-500">Latency: {diagnosticResult.debug.response.responseTime}</span>
                            )}
                          </div>

                          <div className="space-y-4">
                            {/* Spec Comparison Section */}
                            {diagnosticResult.specCheck && (
                              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 space-y-2">
                                <h6 className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Compare With GHL Spec</h6>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400">Endpoint Matches Spec:</span>
                                    <span className={cn("text-[10px] font-bold", diagnosticResult.specCheck.endpointMatches ? "text-emerald-400" : "text-rose-400")}>
                                      {diagnosticResult.specCheck.endpointMatches ? "YES" : "NO"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400">Method Matches Spec:</span>
                                    <span className={cn("text-[10px] font-bold", diagnosticResult.specCheck.methodMatches ? "text-emerald-400" : "text-rose-400")}>
                                      {diagnosticResult.specCheck.methodMatches ? "YES" : "NO"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400">Required Params Present:</span>
                                    <span className={cn("text-[10px] font-bold", diagnosticResult.specCheck.requiredParamsPresent ? "text-emerald-400" : "text-rose-400")}>
                                      {diagnosticResult.specCheck.requiredParamsPresent ? "YES" : "NO"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400">Unexpected Params:</span>
                                    <span className={cn("text-[10px] font-bold", !diagnosticResult.specCheck.unexpectedParamsPresent ? "text-emerald-400" : "text-rose-400")}>
                                      {diagnosticResult.specCheck.unexpectedParamsPresent ? "YES" : "NONE"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Request Section */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[8px] font-bold uppercase">Request</span>
                                <span className="text-[9px] text-slate-500 font-mono italic">{diagnosticResult.debug?.function}</span>
                              </div>
                              <div className="space-y-2 font-mono text-[10px]">
                                <div className="flex gap-2">
                                  <span className="text-slate-500 min-w-[80px]">Base URL:</span>
                                  <span className="text-slate-300">{diagnosticResult.debug?.baseUrl}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-slate-500 min-w-[80px]">Endpoint:</span>
                                  <span className="text-slate-300">{diagnosticResult.debug?.endpoint}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-slate-500 min-w-[80px]">Method:</span>
                                  <span className="text-emerald-400 font-bold">{diagnosticResult.debug?.method || 'GET'}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-slate-500 min-w-[80px]">API Version:</span>
                                  <span className="text-slate-300">{diagnosticResult.debug?.apiVersion}</span>
                                </div>
                                <div className="flex gap-2">
                                  <span className="text-slate-500 min-w-[80px]">Full URL:</span>
                                  <span className="text-slate-300 break-all">{diagnosticResult.debug?.request?.url}</span>
                                </div>
                                <div className="mt-2 text-[9px] text-slate-600 font-bold uppercase tracking-tight">Headers</div>
                                <pre className="p-2 bg-slate-950 rounded border border-slate-800 text-slate-400 text-[9px] overflow-x-auto">
                                  {JSON.stringify(diagnosticResult.debug?.request?.headers, null, 2)}
                                </pre>
                                <div className="mt-2 text-[9px] text-slate-600 font-bold uppercase tracking-tight">Query Params</div>
                                <pre className="p-2 bg-slate-950 rounded border border-slate-800 text-slate-400 text-[9px] overflow-x-auto">
                                  {JSON.stringify(diagnosticResult.debug?.request?.params, null, 2)}
                                </pre>
                              </div>
                            </div>

                            {/* Response Section */}
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                                  diagnosticResult.success ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                                )}>Response</span>
                                <span className="text-[9px] text-slate-500 font-mono">{diagnosticResult.debug?.response?.status} {diagnosticResult.debug?.response?.statusText}</span>
                              </div>
                              <div className="space-y-2 font-mono text-[10px]">
                                {diagnosticResult.debug?.response?.traceId && (
                                  <div className="flex gap-2">
                                    <span className="text-slate-500 min-w-[80px]">Trace ID:</span>
                                    <span className="text-slate-300">{diagnosticResult.debug.response.traceId}</span>
                                  </div>
                                )}
                                <div className="mt-2 text-[9px] text-slate-600 font-bold uppercase tracking-tight">Response Headers</div>
                                <pre className="p-2 bg-slate-950 rounded border border-slate-800 text-slate-400 text-[9px] overflow-x-auto max-h-32">
                                  {JSON.stringify(diagnosticResult.debug?.response?.headers, null, 2)}
                                </pre>
                                <div className="mt-2 text-[9px] text-slate-600 font-bold uppercase tracking-tight">Body</div>
                                <pre className="p-3 bg-slate-950 rounded border border-slate-800 text-slate-300 text-[9px] overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                                  {diagnosticResult.debug?.response?.body || JSON.stringify(diagnosticResult, null, 2)}
                                </pre>
                              </div>
                            </div>

                            {/* Appointment Creation Debug Section */}
                            <div className="pt-4 border-t border-slate-800">
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                  <Calendar size={12} className="text-sky-400" />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-sky-400">Appointment Creation Debug</span>
                                </div>
                                {diagnosticResult.appointmentAttempted ? (
                                  <span className="px-1.5 py-0.5 bg-sky-500/10 text-sky-400 rounded text-[8px] font-bold uppercase">Attempted</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded text-[8px] font-bold uppercase">Not Attempted</span>
                                )}
                              </div>

                              {!diagnosticResult.appointmentAttempted ? (
                                <div className="p-3 bg-slate-950/50 rounded border border-slate-800">
                                  <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Reason:</div>
                                  <div className="text-[10px] text-slate-400 italic">{diagnosticResult.appointmentReason}</div>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {/* Slot Comparison */}
                                  <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 space-y-2">
                                    <h6 className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Slot Comparison</h6>
                                    <div className="space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400">GHL Returned Slot:</span>
                                        <span className="text-[10px] text-slate-300 font-mono">{diagnosticResult.appointmentDebug.selectedSlot}</span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400">Appointment Start Sent:</span>
                                        <span className="text-[10px] text-slate-300 font-mono">{diagnosticResult.appointmentDebug.startTimeSent}</span>
                                      </div>
                                      <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
                                        <span className="text-[10px] text-slate-400">Exact Match:</span>
                                        <span className={cn("text-[10px] font-bold", diagnosticResult.appointmentDebug.exactMatch ? "text-emerald-400" : "text-rose-400")}>
                                          {diagnosticResult.appointmentDebug.exactMatch ? "YES" : "NO"}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Request Details */}
                                  <div className="space-y-2 font-mono text-[10px]">
                                    <div className="flex gap-2">
                                      <span className="text-slate-500 min-w-[80px]">Endpoint:</span>
                                      <span className="text-slate-300 break-all">{diagnosticResult.appointmentDebug.url}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-slate-500 min-w-[80px]">Method:</span>
                                      <span className="text-sky-400 font-bold">{diagnosticResult.appointmentDebug.method}</span>
                                    </div>
                                    <div className="mt-2 text-[9px] text-slate-600 font-bold uppercase tracking-tight">Request Body</div>
                                    <pre className="p-2 bg-slate-950 rounded border border-slate-800 text-slate-400 text-[9px] overflow-x-auto">
                                      {JSON.stringify(diagnosticResult.appointmentDebug.body, null, 2)}
                                    </pre>
                                  </div>

                                  {/* Response Details */}
                                  <div className="space-y-2 font-mono text-[10px]">
                                    <div className="flex gap-2">
                                      <span className="text-slate-500 min-w-[80px]">Status:</span>
                                      <span className={cn(
                                        "font-bold",
                                        diagnosticResult.appointmentDebug.response.status < 300 ? "text-emerald-400" : "text-rose-400"
                                      )}>{diagnosticResult.appointmentDebug.response.status}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <span className="text-slate-500 min-w-[80px]">Trace ID:</span>
                                      <span className="text-slate-300">{diagnosticResult.appointmentDebug.response.traceId}</span>
                                    </div>
                                    <div className="mt-2 text-[9px] text-slate-600 font-bold uppercase tracking-tight">Response Body</div>
                                    <pre className="p-3 bg-slate-950 rounded border border-slate-800 text-slate-300 text-[9px] overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                                      {diagnosticResult.appointmentDebug.response.body}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3: Webhook Information & Outbound Triggers */}
                <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-6">
                  <div className="flex items-center justify-between border-b border-[#F2F2F2] pb-3">
                    <div className="flex items-center gap-2">
                      <Webhook className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Webhook URL Channels</h4>
                    </div>
                  </div>

                  {/* Read-Only Inbound Webhook URL */}
                  <div className="bg-[#FAF9F6] p-5 rounded-xl border border-[#EBE8E3] space-y-4">
                    <div className="md:flex justify-between items-center bg-white p-3 rounded-xl border border-[#E5E5E5]">
                      <div className="space-y-1 min-w-0 pr-3">
                        <span className="text-[9px] font-bold tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-full">Target Inbound URL</span>
                        <p className="font-mono text-xs text-[#333333] select-all break-all mt-1">
                          {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/ghl` : 'https://fence-estimator-eight.vercel.app/api/webhooks/ghl'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyText(typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/ghl` : 'https://fence-estimator-eight.vercel.app/api/webhooks/ghl', setCopiedUrl)}
                        className="mt-3 md:mt-0 shrink-0 px-4 py-2 bg-[#FAF9F6] hover:bg-[#EBE8E3] text-xs font-bold border border-[#E5E5E5] rounded-xl flex items-center gap-1.5 transition-all"
                      >
                        <Copy size={12} /> {copiedUrl ? "Copied!" : "Copy URL"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1 text-[#666666]">
                        <p className="font-bold text-[#333] flex items-center gap-1">Header verification:</p>
                        <p className="bg-[#F2F2F2] px-2 py-1 rounded font-mono text-[10px] break-all select-all">x-lsfw-webhook-secret: {formData.ghlInboundWebhookSecret || 'YOUR_SECRET'}</p>
                      </div>
                      <div className="space-y-1 text-[#666666]">
                        <p className="font-bold text-[#333] flex items-center gap-1">Query fallback parameter:</p>
                        <p className="bg-[#F2F2F2] px-2 py-1 rounded font-mono text-[10px] break-all select-all">?secret={formData.ghlInboundWebhookSecret || 'YOUR_SECRET'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Outbound Sync URL (Existing) */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#666666]">General GoHighLevel Webhook (Outbound Dispatcher)</label>
                    <div className="relative">
                      <Webhook className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={16} />
                      <input 
                        type="url" 
                        placeholder="https://services.gohighlevel.com/webhook/..."
                        value={formData.ghlWebhookUrl}
                        onChange={(e) => setFormData({...formData, ghlWebhookUrl: e.target.value})}
                        className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-3 text-sm font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                      />
                    </div>
                  </div>

                  {/* Workflow Webhooks (Existing) */}
                  <div className="border-t border-[#F2F2F2] pt-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#333333]">Specific Outbound Pipeline Milestones</h4>
                    <p className="text-[10px] text-[#666666] -mt-2">Enable surgical triggering into different CRM automation workflows based on specific app status milestones.</p>

                    <div className="space-y-4">
                      {[
                        { label: "Instant Estimator Submitted Webhook", field: "ghlWebhookInstantEstimateSubmitted" },
                        { label: "Manual Estimate Sent Webhook", field: "ghlWebhookManualEstimateSent" },
                        { label: "Estimate Accepted Webhook", field: "ghlWebhookEstimateAccepted" },
                        { label: "Estimate Completed Webhook", field: "ghlWebhookEstimateCompleted" },
                        { label: "Estimate Declined Webhook", field: "ghlWebhookEstimateDeclined" }
                      ].map((item) => (
                        <div key={item.field} className="space-y-1">
                          <label className="text-xs font-semibold text-[#666666]">{item.label}</label>
                          <div className="relative">
                            <Webhook className="absolute left-4 top-1/2 -translate-y-1/2 text-[#999999]" size={14} />
                            <input 
                              type="url" 
                              placeholder="https://services.gohighlevel.com/webhook/..."
                              value={(formData as any)[item.field]}
                              onChange={(e) => setFormData({...formData, [item.field]: e.target.value})}
                              className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-12 py-2.5 text-xs font-mono focus:border-american-blue focus:outline-none focus:bg-white transition-all" 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Section 4 & 7 & 8: Connections Status, scheduler and info dashboards merged for high-fidelity density */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Outbound & Inbound Status Tracker */}
                  <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#F2F2F2] pb-3">
                      <Activity className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Connection Status</h4>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F9F9F9] border border-[#E5E5E5]">
                        <div>
                          <p className="text-xs font-bold text-[#333333]">Outbound Webhooks</p>
                          <p className="text-[10px] text-[#666666]">Client to CRM Sync</p>
                        </div>
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase",
                          formData.ghlWebhookUrl ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-neutral-50 text-neutral-500 border border-neutral-200"
                        )}>
                          {formData.ghlWebhookUrl ? "Connected (Live)" : "Not Configured"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#F9F9F9] border border-[#E5E5E5]">
                        <div>
                          <p className="text-xs font-bold text-[#333333]">Inbound Webhooks</p>
                          <p className="text-[10px] text-[#666666]">CRM to Client Sync</p>
                        </div>
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase",
                          ghlStatus?.status?.inbound === 'Connected' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                        )}>
                          {ghlStatus?.status?.inbound === 'Connected' ? "Connected (Listening)" : "Never Tested / Waiting"}
                        </span>
                      </div>

                      <div className="border-t border-[#F2F2F2] pt-4 grid grid-cols-2 gap-3 text-xs">
                        <div className="p-2 border border-[#E5E5E5] rounded-xl bg-white">
                          <p className="text-[9px] font-medium text-[#666666] uppercase">Last Success Sync</p>
                          <p className="font-mono text-[10px] font-bold text-[#333333] mt-0.5 truncate">
                            {ghlStatus?.status?.lastSuccessfulSync ? new Date(ghlStatus.status.lastSuccessfulSync).toLocaleString() : 'Never'}
                          </p>
                        </div>
                        <div className="p-2 border border-[#E5E5E5] rounded-xl bg-white">
                          <p className="text-[9px] font-medium text-[#666666] uppercase">Last Failed Sync</p>
                          <p className="font-mono text-[10px] font-bold text-red-600 mt-0.5 truncate">
                            {ghlStatus?.status?.lastFailedSync ? new Date(ghlStatus.status.lastFailedSync).toLocaleString() : 'None'}
                          </p>
                        </div>
                      </div>

                      {ghlStatus?.status?.lastErrorMessage && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex gap-1.5 text-[10px] text-red-800">
                          <AlertCircle size={14} className="shrink-0 text-red-600 mt-0.5" />
                          <div>
                            <span className="font-bold">Last Error Received:</span>
                            <p className="font-mono text-[9px] mt-0.5 whitespace-pre-wrap">{ghlStatus.status.lastErrorMessage}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Customer Sync Stats Dashboard */}
                  <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#F2F2F2] pb-3">
                      <Database className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Customer Database Analytics</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 border border-[#E5E5E5] rounded-xl">
                        <p className="text-[10px] font-medium text-slate-600 uppercase">Total Cloned Leads</p>
                        <p className="font-sans text-xl font-black mt-1 text-[#333333]">
                          {ghlStatus?.stats?.totalCustomers ?? '...'}
                        </p>
                      </div>
                      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                        <p className="text-[10px] font-medium text-blue-700 uppercase">Synchronized from GHL</p>
                        <p className="font-sans text-xl font-black mt-1 text-blue-900">
                          {ghlStatus?.stats?.customersFromGhl ?? '...'}
                        </p>
                      </div>
                      <div className="p-3 bg-white border border-[#E5E5E5] rounded-xl">
                        <p className="text-[10px] font-medium text-[#666666] uppercase">Previous Estimates Match</p>
                        <p className="font-sans text-xl font-black mt-1 text-[#333333]">
                          {ghlStatus?.stats?.customersFromPrevEstimates ?? '...'}
                        </p>
                      </div>
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <p className="text-[10px] font-medium text-emerald-800 uppercase">Duplicate Merges</p>
                        <p className="font-sans text-xl font-black mt-1 text-emerald-950">
                          {ghlStatus?.stats?.duplicateMerges ?? '...'}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 text-[11px] text-[#666666]">
                      <div className="flex justify-between border-b border-[#F2F2F2] pb-1">
                        <span>Last Contact Synced:</span>
                        <span className="font-medium text-[#333] font-mono whitespace-nowrap truncate pl-2 max-w-[200px]" title={ghlStatus?.status?.lastContactSynced}>
                          {ghlStatus?.status?.lastContactSynced ? ghlStatus.status.lastContactSynced.split(' (')[0] : 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Appointment Sync:</span>
                        <span className="font-medium text-[#333] font-mono whitespace-nowrap truncate pl-2 max-w-[200px]" title={ghlStatus?.status?.lastAppointmentSynced}>
                          {ghlStatus?.status?.lastAppointmentSynced ? ghlStatus.status.lastAppointmentSynced.split(' (')[0] : 'None'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Section 8: Scheduler sync dashboard */}
                  <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#F2F2F2] pb-3">
                      <Calendar className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Scheduler Event Synchronization</h4>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-[#F9F9F9] p-3 rounded-xl border border-[#E5E5E5]">
                        <div>
                          <p className="text-xs font-bold text-[#333333]">Appointment Integration</p>
                          <p className="text-[10px] text-[#666666]">CRM Scheduler Callback Sync</p>
                        </div>
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          ACTIVE
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between border-b border-[#F2F2F2] pb-1.5 text-[#666666]">
                          <span>Calendar ID Target:</span>
                          <span className="font-mono text-[10px] text-[#333] font-medium">{ghlStatus?.scheduler?.calendarId || 'test_calendar_id_999'}</span>
                        </div>
                        <div className="flex justify-between border-b border-[#F2F2F2] pb-1.5 text-[#666666]">
                          <span>Appointment Source:</span>
                          <span className="font-mono text-[10px] text-[#333] font-medium">{ghlStatus?.scheduler?.appointmentSource || 'GHL Scheduler'}</span>
                        </div>
                        <div className="flex justify-between text-[#666666]">
                          <span>Last Event Synced:</span>
                          <span className="font-mono text-[10px] text-[#333] font-medium">
                            {ghlStatus?.scheduler?.lastAppointmentReceived ? new Date(ghlStatus.scheduler.lastAppointmentReceived).toLocaleString() : 'None Syncing'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 9: Customer Prefill Controls */}
                  <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#F2F2F2] pb-3">
                      <Search className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Customer Lookup Controls</h4>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-[#333]">Lookup Search Sources</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {[
                            { id: 'customers', label: "My Customers List" },
                            { id: 'estimates', label: "Previous Estimates font" },
                            { id: 'ghl', label: "GHL Synced" }
                          ].map(source => {
                            const isChecked = (formData.ghlPrefillSources || []).includes(source.id);
                            return (
                              <button
                                key={source.id}
                                type="button"
                                onClick={() => handlePrefillSourcesChange(source.id)}
                                className={cn(
                                  "p-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all",
                                  isChecked ? "bg-blue-50 text-blue-900 border-blue-200" : "bg-[#F9F9F9] text-[#666666] border-[#E5E5E5] hover:bg-slate-100"
                                )}
                              >
                                {isChecked ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} />}
                                {source.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#666666] uppercase">Min Search Characters</label>
                          <input 
                            type="number"
                            min="1"
                            max="5"
                            value={formData.ghlMinChars}
                            onChange={(e) => setFormData({...formData, ghlMinChars: Number(e.target.value) || 2})}
                            className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-3 py-2 text-xs font-bold focus:border-american-blue focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#666666] uppercase">Max Auto-Prefill Results</label>
                          <input 
                            type="number"
                            min="1"
                            max="50"
                            value={formData.ghlMaxResults}
                            onChange={(e) => setFormData({...formData, ghlMaxResults: Number(e.target.value) || 10})}
                            className="w-full rounded-xl border border-[#E5E5E5] bg-[#F9F9F9] px-3 py-2 text-xs font-bold focus:border-american-blue focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 10: CRM Automation Suppression Settings */}
                  <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-4 md:col-span-2">
                    <div className="flex items-center gap-2 border-b border-[#F2F2F2] pb-3">
                      <ShieldCheck className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider font-sans">CRM Automation Settings</h4>
                    </div>

                    <p className="text-xs text-gray-500 font-sans leading-relaxed">
                      Configure when the system should automatically suppress duplicate outbound webhooks to prevent existing clients or active estimates from being re-entered into marketing/nurture campaigns.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="space-y-0.5">
                            <label className="text-xs font-bold text-gray-800">Enable Instant Estimate Webhook</label>
                            <p className="text-[10px] text-gray-500">Allow submitting estimators to trigger outbound GHL webhooks.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, enableInstantEstimateWebhook: !formData.enableInstantEstimateWebhook})}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                              formData.enableInstantEstimateWebhook ? "bg-blue-600" : "bg-gray-200"
                            )}
                          >
                            <span className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                              formData.enableInstantEstimateWebhook ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="space-y-0.5">
                            <label className="text-xs font-bold text-gray-800">Suppress For Existing Customers</label>
                            <p className="text-[10px] text-gray-500">Skip automation if customer record already exists in database.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, suppressInstantEstimateWorkflowExisting: !formData.suppressInstantEstimateWorkflowExisting})}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                              formData.suppressInstantEstimateWorkflowExisting ? "bg-blue-600" : "bg-gray-200"
                            )}
                          >
                            <span className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                              formData.suppressInstantEstimateWorkflowExisting ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="space-y-0.5">
                            <label className="text-xs font-bold text-gray-800">Suppress If Estimate Already Scheduled</label>
                            <p className="text-[10px] text-gray-500">Skip if customer status is 'Estimate Scheduled'.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, suppressIfEstimateScheduled: !formData.suppressIfEstimateScheduled})}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                              formData.suppressIfEstimateScheduled ? "bg-blue-600" : "bg-gray-200"
                            )}
                          >
                            <span className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                              formData.suppressIfEstimateScheduled ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="space-y-0.5">
                            <label className="text-xs font-bold text-gray-800">Suppress If Estimate Already Sent</label>
                            <p className="text-[10px] text-gray-500">Skip if customer status is 'Estimate Sent'.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, suppressIfEstimateSent: !formData.suppressIfEstimateSent})}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                              formData.suppressIfEstimateSent ? "bg-blue-600" : "bg-gray-200"
                            )}
                          >
                            <span className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                              formData.suppressIfEstimateSent ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="space-y-0.5">
                            <label className="text-xs font-bold text-gray-800">Suppress If Customer Accepted</label>
                            <p className="text-[10px] text-gray-500">Skip automation if customer status is 'Accepted'.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, suppressIfCustomerAccepted: !formData.suppressIfCustomerAccepted})}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                              formData.suppressIfCustomerAccepted ? "bg-blue-600" : "bg-gray-200"
                            )}
                          >
                            <span className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                              formData.suppressIfCustomerAccepted ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <div className="space-y-0.5">
                            <label className="text-xs font-bold text-gray-800">Suppress If Customer Completed</label>
                            <p className="text-[10px] text-gray-500">Skip if status is 'Completed' or 'In Progress/Scheduled/Archived'.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, suppressIfCustomerCompleted: !formData.suppressIfCustomerCompleted})}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                              formData.suppressIfCustomerCompleted ? "bg-blue-600" : "bg-gray-200"
                            )}
                          >
                            <span className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                              formData.suppressIfCustomerCompleted ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 md:col-span-2">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/50 border border-blue-100">
                          <div className="space-y-0.5 w-[85%]">
                            <label className="text-xs font-bold text-blue-900">Allow Manual Force Trigger</label>
                            <p className="text-[10px] text-blue-700">Display a "Force Instant Estimate Workflow" option to the estimator user during Customer Estimator submission.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({...formData, allowManualForceTrigger: !formData.allowManualForceTrigger})}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none",
                              formData.allowManualForceTrigger ? "bg-blue-600" : "bg-gray-100"
                            )}
                          >
                            <span className={cn(
                              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                              formData.allowManualForceTrigger ? "translate-x-5" : "translate-x-0"
                            )} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 5: Webhook Testing sandbox */}
                <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-6">
                  <div className="flex items-center justify-between border-b border-[#F2F2F2] pb-3">
                    <div className="flex items-center gap-2">
                      <Send className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Diagnostic Sandbox & Simulation</h4>
                    </div>
                    <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium">Risk-Free Playback</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Outbound webhook testing sandbox */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h5 className="text-xs font-bold text-[#333]">Outbound Sync Transmitter Simulator</h5>
                        <p className="text-[10px] text-[#666666]">Dispatches a valid Instant Lead submission payload to your destination GoHighLevel Webhook URL.</p>
                      </div>

                      <button
                        type="button"
                        onClick={handleTestOutbound}
                        disabled={isTestingOutbound || !formData.ghlWebhookUrl}
                        className="w-full py-2.5 rounded-xl bg-american-blue text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-[#1a2c4e] transition-all disabled:opacity-50"
                      >
                        {isTestingOutbound ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                        Test Outbound Webhook Sync
                      </button>

                      {testOutboundResult && (
                        <div className={cn(
                          "p-4 rounded-xl text-xs space-y-2 border animate-fade-in",
                          testOutboundResult.success ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
                        )}>
                          <p className="font-bold">{testOutboundResult.message}</p>
                          {testOutboundResult.statusCode !== undefined && (
                            <p className="font-mono text-[10px]">HTTP Status Code: <span className="font-bold">{testOutboundResult.statusCode}</span></p>
                          )}
                          {testOutboundResult.responseText && (
                            <pre className="font-mono text-[9px] bg-white/70 p-2 rounded max-h-24 overflow-y-auto whitespace-pre-wrap select-all">
                              {testOutboundResult.responseText}
                            </pre>
                          )}
                          {testOutboundResult.error && (
                            <p className="font-mono text-[10px] text-red-700 font-medium">Error detailing: {testOutboundResult.error}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Inbound webhook testing sandbox */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h5 className="text-xs font-bold text-[#333]">Inbound Sync Receiver Simulator</h5>
                        <p className="text-[10px] text-[#666666]">Sends a mock GHL `contactCreate` payload directly into your endpoint to verify duplicate detection mechanisms.</p>
                      </div>

                      <button
                        type="button"
                        onClick={handleTestInbound}
                        disabled={isTestingInbound || !formData.ghlInboundWebhookSecret}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {isTestingInbound ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                        Test Inbound Webhook Processing
                      </button>

                      {testInboundResult && (
                        <div className={cn(
                          "p-4 rounded-xl text-xs space-y-2 border animate-fade-in",
                          testInboundResult.success ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
                        )}>
                          <p className="font-bold">{testInboundResult.message}</p>
                          {testInboundResult.diagnostics && (
                            <div className="space-y-1 font-mono text-[9px]">
                              <p>Gateway Target: <span className="font-bold">{testInboundResult.diagnostics.endpointUrl}</span></p>
                              <p>HTTP Return Status: <span className="font-bold">{testInboundResult.diagnostics.httpStatus}</span></p>
                              <p>Duplicate Match Method: <span className="font-bold uppercase text-blue-800">{testInboundResult.diagnostics.matchedBy}</span></p>
                              <p>Identified Customer Doc ID: <span className="font-bold text-black">{testInboundResult.diagnostics.customerId}</span></p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Direct API Sync Layer testing sandbox */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h5 className="text-xs font-bold text-[#333]">Direct GHL API Sync Simulator</h5>
                        <p className="text-[10px] text-[#666666]">Invokes your API Key to verify authentication, pipeline visibility, and create a real contact entry.</p>
                      </div>

                      <button
                        type="button"
                        onClick={handleRunApiSyncTest}
                        disabled={isTestingApiSync || !formData.ghlApiKey || !formData.ghlLocationId}
                        className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {isTestingApiSync ? <RefreshCw size={14} className="animate-spin animate-spin-slow" /> : <Activity size={14} />}
                        Run GHL API Sync Test
                      </button>

                      {testApiSyncResult && (
                        <div className={cn(
                          "p-4 rounded-xl text-xs space-y-2 border animate-fade-in",
                          testApiSyncResult.success ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
                        )}>
                          <p className="font-bold flex items-center gap-1.5 text-xs text-black font-extrabold uppercase">
                            <span>Diagnostic Trace Out:</span>
                            <span className={testApiSyncResult.success ? "text-emerald-600" : "text-amber-600"}>
                              {testApiSyncResult.success ? "Passed" : "Warning"}
                            </span>
                          </p>
                          <p className="text-[10px] text-gray-700 font-medium">{testApiSyncResult.message}</p>
                          
                          {testApiSyncResult.steps && Array.isArray(testApiSyncResult.steps) && (
                            <div className="bg-white/70 p-2 rounded max-h-32 overflow-y-auto font-mono text-[9px] text-gray-800 space-y-1 my-1.5 border border-gray-100">
                              {testApiSyncResult.steps.map((stepStr: string, idx: number) => (
                                <p key={idx} className="leading-normal break-words">{stepStr}</p>
                              ))}
                            </div>
                          )}

                          {testApiSyncResult.results && (
                            <div className="mt-3 space-y-2 border-t border-slate-200/60 pt-3">
                              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Sync Subsystems Health Check:</p>
                              <div className="space-y-1.5">
                                {Object.entries(testApiSyncResult.results).map(([key, item]: [string, any]) => {
                                  const labels: Record<string, string> = {
                                    contact: "Contact Creation",
                                    opportunity: "Opportunity Creation",
                                    stage: "Stage Mapping & Updates",
                                    customField: "Custom Fields Sync",
                                    firestoreLog: "Firestore Transaction Log"
                                  };
                                  
                                  let colorClasses = "bg-slate-100/80 text-slate-700 border-slate-200";
                                  let dotBg = "bg-slate-400";
                                  if (item.status === 'pass') {
                                    colorClasses = "bg-emerald-50 text-emerald-800 border-emerald-100";
                                    dotBg = "bg-emerald-500";
                                  } else if (item.status === 'warning') {
                                    colorClasses = "bg-amber-100/70 text-amber-900 border-amber-200";
                                    dotBg = "bg-amber-500";
                                  } else if (item.status === 'fail') {
                                    colorClasses = "bg-rose-50 text-rose-800 border-rose-100";
                                    dotBg = "bg-rose-500";
                                  }

                                  return (
                                    <div key={key} className={cn("p-2 rounded-lg border text-[10px] flex items-start gap-2 leading-relaxed transition-all", colorClasses)}>
                                      <span className={cn("h-1.5 w-1.5 rounded-full mt-1 shrink-0", dotBg)} />
                                      <div className="flex-1">
                                        <span className="font-bold block text-slate-900">{labels[key] || key}</span>
                                        <span className="text-[9px] opacity-90 mt-0.5 block">{item.message}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {testApiSyncResult.testContactId && (
                            <p className="font-mono text-[9px] text-emerald-800 font-semibold bg-emerald-100/40 p-1 px-2 rounded">
                              Created Contact ID: <span className="font-black">{testApiSyncResult.testContactId}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Connection Validator Suite */}
                  <div className="border-t border-[#F2F2F2] pt-6 grid grid-cols-1 xl:grid-cols-3 gap-6 animate-fade-in text-sans">
                    <div className="xl:col-span-1 space-y-4 pr-0 xl:pr-4 xl:border-r border-[#F2F2F2]">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded uppercase">Health Suite</span>
                        <h5 className="text-xs font-bold text-[#333333] mt-1.5">GoHighLevel 10-Point Diagnostic Checklist</h5>
                        <p className="text-[10px] leading-relaxed text-[#666666]">
                          Run diagnostic trace passes covering settings config, server pingbacks, database read/writes, lookup indexes, and prefill APIs.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunDiagnostic}
                        disabled={isTestingDiagnostic}
                        className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        {isTestingDiagnostic ? <RefreshCw size={14} className="animate-spin" /> : <Activity size={14} />}
                        Run Diagnostic Checklist
                      </button>

                      {diagnosticResult && (
                        <div className="p-3 bg-slate-50 border border-[#E5E5E5] rounded-xl text-[10px] text-[#333333]">
                          <p className="font-extrabold text-[#000000] mb-1.5 flex justify-between">
                            <span>Diagnostic Result</span>
                            <span className={diagnosticResult.success ? "text-emerald-600" : "text-amber-600"}>
                              {diagnosticResult.success ? "Complete" : "Failed"}
                            </span>
                          </p>
                          {diagnosticResult.error && (
                            <p className="text-[9px] text-red-600 font-mono italic break-words">{diagnosticResult.error}</p>
                          )}
                          <p className="text-[9px] text-[#666666] mt-1">Traced: {new Date().toLocaleTimeString()}</p>
                        </div>
                      )}
                    </div>

                    <div className="xl:col-span-2 space-y-3">
                      <h6 className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">Trace Points Evaluation Status</h6>
                      {diagnosticResult && diagnosticResult.results ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          {[
                            { key: 'settingsExist', label: 'Company Settings Configured' },
                            { key: 'locationIdExists', label: 'GHL Location ID Configured' },
                            { key: 'apiKeyExists', label: 'GHL Authorization API Key' },
                            { key: 'webhookSecretExists', label: 'Inbound Verification Secret Key' },
                            { key: 'inboundEndpointResponds', label: 'GHL Inbound Gateway Listener' },
                            { key: 'firestoreWritable', label: 'Firestore DB Write Integrity' },
                            { key: 'customersAccessible', label: 'Firestore Customers Collection' },
                            { key: 'webhookLoggingEnabled', label: 'Double Logging Pipeline (Legacy + Unified)' },
                            { key: 'searchEndpointResponds', label: 'Prefill Index Lookup Autocomplete API' },
                            { key: 'prefillEndpointResponds', label: 'Prefill Hydrator API endpoint' }
                          ].map((check) => {
                            const passed = diagnosticResult.results[check.key];
                            return (
                              <div key={check.key} className="flex items-center justify-between p-2 rounded-xl bg-[#F9F9F9] border border-[#E5E5E5]">
                                <span className="font-medium text-[#444444]">{check.label}</span>
                                <span className={cn(
                                  "text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full select-none",
                                  passed ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-red-50 text-red-600 border border-red-200"
                                )}>
                                  {passed ? "Pass" : "Fail"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-8 text-center text-[11px] text-[#999999] rounded-xl border border-dashed border-[#E5E5E5]">
                          Launch the 10-Point Trace Checklist to test connection security, router gateways, and query handlers.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Duplicate Scanner & Prefill Customer Lookup row */}
                  <div className="border-t border-[#F2F2F2] pt-6 grid grid-cols-1 xl:grid-cols-2 gap-6 animate-fade-in text-sans">
                    {/* Duplicate Scanner Sandbox */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded uppercase">Duplicate Protection Rules</span>
                        <h5 className="text-xs font-bold text-[#333333] mt-1.5">Interactive Duplicate Contact Detector</h5>
                        <p className="text-[10px] text-[#666666]">
                          Run diagnostic test values (Name, Email, Phone) down active database search keys to find exact existing target indexes.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="text" 
                            id="dupNameInput"
                            placeholder="Customer Name"
                            value={dupForm.name}
                            onChange={(e) => setDupForm({...dupForm, name: e.target.value})}
                            className="bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 text-[11px] font-sans focus:outline-none"
                          />
                          <input 
                            type="email" 
                            id="dupEmailInput"
                            placeholder="name@email.com"
                            value={dupForm.email}
                            onChange={(e) => setDupForm({...dupForm, email: e.target.value})}
                            className="bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 text-[11px] font-sans focus:outline-none"
                          />
                        </div>
                        <input 
                          type="tel" 
                          id="dupPhoneInput"
                          placeholder="Phone number"
                          value={dupForm.phone}
                          onChange={(e) => setDupForm({...dupForm, phone: e.target.value})}
                          className="w-full bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 text-[11px] font-sans focus:outline-none"
                        />
                      </div>

                      <button
                        type="button"
                        id="dupAnalyzeBtn"
                        onClick={handleCheckDuplicate}
                        disabled={isCheckingDuplicate}
                        className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all rounded-lg"
                      >
                        {isCheckingDuplicate ? <RefreshCw size={12} className="animate-spin" /> : <Search size={12} />}
                        Analyze Keys for Duplicates
                      </button>

                      {checkDuplicateResult && (
                        <div className={cn(
                          "p-3 rounded-lg border text-[11px] font-medium transition-all animate-fade-in",
                          checkDuplicateResult.wouldMatch 
                            ? "bg-amber-50 text-amber-900 border-amber-200" 
                            : "bg-emerald-50 text-emerald-900 border-emerald-200"
                        )}>
                          <span className="font-extrabold text-[12px] block mb-1">
                            {checkDuplicateResult.wouldMatch ? "⚠️ Duplicate Entity Detected" : "✅ Lead Clearance Approved"}
                          </span>
                          {checkDuplicateResult.wouldMatch ? (
                            <p>
                              A pre-existing customer matches by <span className="font-extrabold uppercase text-purple-700 font-mono text-[10px]">{checkDuplicateResult.matchedBy}</span>. 
                              Inbound triggers will merge automatically on Document ID: <span className="font-extrabold font-mono text-[10px] bg-white p-1 rounded border border-[#E5E5E5] select-all block mt-1 text-black">{checkDuplicateResult.customerId}</span>
                            </p>
                          ) : (
                            <p>No matching Name, Email, or Phone exists inside Firestore. A fresh primary Customer doc will compile cleanly on submittal.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Customer Lookup Prefill Simulator */}
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded uppercase font-sans">Autocomplete Hydrator</span>
                        <h5 className="text-xs font-bold text-[#333333] mt-1.5">Prefill Customer Autocomplete Lookups</h5>
                        <p className="text-[10px] text-[#666666]">
                          Simulate client estimate portal queries. Fast-hydrates fields by searching across Customer List, Previous Estimates, or GHL Contacts.
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="Search queries (e.g. John, test)"
                          value={prefillQuery}
                          onChange={(e) => setPrefillQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handlePrefillSearch()}
                          className="flex-1 bg-[#F9F9F9] border border-[#E5E5E5] rounded-lg px-2.5 py-1.5 text-[11px] font-sans focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handlePrefillSearch}
                          disabled={isTestingPrefillQuery || !prefillQuery.trim()}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg transition-all disabled:opacity-50"
                        >
                          {isTestingPrefillQuery ? <RefreshCw size={12} className="animate-spin" /> : "Search DB"}
                        </button>
                      </div>

                      <div className="max-h-40 overflow-y-auto border border-[#E5E5E5] rounded-xl divide-y divide-[#F2F2F2] bg-white text-[11px]">
                        {prefillResults.length > 0 ? (
                          prefillResults.map((resItem: any) => (
                            <div key={resItem.id} className="p-2.5 hover:bg-slate-50 flex justify-between items-center transition-colors">
                              <div className="min-w-0 pr-3">
                                <p className="font-extrabold text-neutral-800 truncate">{resItem.customerName}</p>
                                <p className="text-[9px] text-[#666666] truncate font-mono mt-0.5">{resItem.email} | {resItem.phone}</p>
                              </div>
                              <span className="shrink-0 text-[8px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full uppercase">
                                {resItem.source || 'Database Match'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-6 text-center text-[#999999] italic">
                            {isTestingPrefillQuery ? "Searching..." : "No items simulated. Try searching for 'test'."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 6: Webhook Log Viewer */}
                <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-white space-y-4">
                  <div className="flex items-center justify-between border-b border-[#F2F2F2] pb-3">
                    <div className="flex items-center gap-2">
                      <Server className="text-american-blue" size={18} />
                      <h4 className="text-sm font-bold text-american-blue uppercase tracking-wider">Recent Webhook Activity Log Viewer</h4>
                    </div>
                    <button
                      type="button"
                      onClick={fetchGhlIntegrationStatus}
                      className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1 transition-all"
                    >
                      <RefreshCw size={12} className={cn(isFetchStatusLoading && "animate-spin")} /> Refresh
                    </button>
                  </div>

                  {(!ghlStatus?.logs || ghlStatus.logs.length === 0) ? (
                    <div className="p-12 text-center rounded-xl bg-slate-50 border border-dashed border-[#E5E5E5] text-[#999999] text-xs">
                      No inbound webhook transaction logs found. Generate a verification key and execute simulator checks to start syncing logs.
                    </div>
                  ) : (
                    <div className="border border-[#E5E5E5] rounded-xl overflow-hidden bg-white text-xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#FAF9F6] border-b border-[#E5E5E5] text-[10px] text-[#666666] font-bold uppercase tracking-wider">
                              <th className="p-3">Received At</th>
                              <th className="p-3">Event Type</th>
                              <th className="p-3">Matching Logic</th>
                              <th className="p-3">Customer ID</th>
                              <th className="p-3">Status</th>
                              <th className="p-3 text-right">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F2F2F2] font-sans">
                            {ghlStatus.logs.map((log: any) => {
                              const isExpanded = expandedLogId === log.id;
                              return (
                                <React.Fragment key={log.id}>
                                  <tr className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3 whitespace-nowrap font-mono text-[10px] text-[#666666]">
                                      {new Date(log.receivedAt).toLocaleString()}
                                    </td>
                                    <td className="p-3 whitespace-nowrap font-semibold text-[#111111]">
                                      {log.eventType}
                                    </td>
                                    <td className="p-3 whitespace-nowrap">
                                      <span className={cn(
                                        "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                                        log.matchedBy === 'new' ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-purple-50 text-purple-700 border border-purple-200"
                                      )}>
                                        {log.matchedBy}
                                      </span>
                                    </td>
                                    <td className="p-3 whitespace-nowrap font-mono text-[10px] text-neutral-500">
                                      {log.customerId || '---'}
                                    </td>
                                    <td className="p-3 whitespace-nowrap">
                                      <span className={cn(
                                        "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase",
                                        log.success ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
                                      )}>
                                        {log.success ? 'Success' : 'Failed'}
                                      </span>
                                    </td>
                                    <td className="p-3 whitespace-nowrap text-right">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                        className="text-xs text-blue-600 hover:text-blue-900 font-bold"
                                      >
                                        {isExpanded ? 'Hide' : 'Expand'}
                                      </button>
                                    </td>
                                  </tr>

                                  {isExpanded && (
                                    <tr className="bg-slate-50/50">
                                      <td colSpan={6} className="p-4 border-t border-[#F2F2F2]">
                                        <div className="space-y-3 font-sans text-xs">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-medium text-[#666666]">
                                            <div>
                                              <span className="text-[#333] font-bold">GHL Contact Identifier:</span>{' '}
                                              <span className="font-mono text-[11px] text-[#222222] select-all">{log.ghlContactId || '---'}</span>
                                            </div>
                                            {log.error && (
                                              <div className="text-red-700">
                                                <span className="font-bold">Execution Error:</span> {log.error}
                                              </div>
                                            )}
                                          </div>

                                          <div className="space-y-1">
                                            <span className="text-[#333] font-bold block">Raw Webhook Payload Preview:</span>
                                            <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[9px] overflow-x-auto whitespace-pre select-all max-h-60 overflow-y-auto">
                                              {JSON.stringify(log.payload, null, 2)}
                                            </pre>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Legacy Webhooks compatibility switches */}
                <div className="p-6 rounded-2xl border border-[#E5E5E5] bg-[#FAF9F6] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-american-blue shadow-sm pb-0.5 border border-[#E5E5E5]">
                        <RefreshCw size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-bold">Auto-Sync Lead Estimates</p>
                        <p className="text-[10px] text-[#666666]">Automatically dispatch decision hooks upon customer signature portal submittals.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setFormData({...formData, autoSyncEstimates: !formData.autoSyncEstimates})}
                      className={cn(
                        "h-6 w-12 rounded-full relative transition-all",
                        formData.autoSyncEstimates ? "bg-american-blue" : "bg-gray-300"
                      )}
                    >
                      <div className={cn(
                        "absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                        formData.autoSyncEstimates ? "right-1" : "left-1"
                      )} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'smtp' && (
              <div className="space-y-8">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Server className="text-american-blue" size={18} />
                  <h3 className="text-sm font-bold text-american-blue uppercase tracking-widest">
                    Email Routing & Dispatch Configuration
                  </h3>
                </div>

                {/* Email Service Choice */}
                <div className="space-y-3 bg-[#f8fafc] p-4 rounded-xl border border-[#e2e8f0]">
                  <label className="block text-xs font-bold uppercase text-[#666666] tracking-widest">
                    Active Email Dispatcher
                  </label>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1a1a1a]">
                      <input
                        type="radio"
                        name="emailProvider"
                        value="resend"
                        checked={formData.emailProvider === 'resend'}
                        onChange={() => setFormData({ ...formData, emailProvider: 'resend' })}
                        className="text-american-blue focus:ring-american-blue"
                      />
                      <span>Resend Delivery Service (Highly Recommended & Default)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1a1a1a]">
                      <input
                        type="radio"
                        name="emailProvider"
                        value="smtp"
                        checked={formData.emailProvider === 'smtp'}
                        onChange={() => setFormData({ ...formData, emailProvider: 'smtp' })}
                        className="text-american-blue focus:ring-american-blue"
                      />
                      <span>Self-hosted Standard SMTP Server</span>
                    </label>
                  </div>
                </div>

                {formData.emailProvider === 'resend' ? (
                  <div className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Resend API Key</label>
                        <input 
                          type="password" 
                          value={formData.resendApiKey}
                          onChange={(e) => setFormData({...formData, resendApiKey: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder={formData.resendApiKey ? "••••••••" : "re_123456789..."}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Admin Notification Email(s)</label>
                        <input 
                          type="text" 
                          value={formData.adminNotificationEmail}
                          onChange={(e) => setFormData({...formData, adminNotificationEmail: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="bradens@lonestarfenceworks.com"
                        />
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Friendly Sender Name</label>
                        <input 
                          type="text" 
                          value={formData.fromName}
                          onChange={(e) => setFormData({...formData, fromName: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="Lone Star Fence Works"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">From Email Address</label>
                        <input 
                          type="text" 
                          value={formData.fromEmail}
                          onChange={(e) => setFormData({...formData, fromEmail: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="estimates@send.lonestarfenceworks.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Reply-To Address</label>
                        <input 
                          type="text" 
                          value={formData.replyToEmail}
                          onChange={(e) => setFormData({...formData, replyToEmail: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="bradens@lonestarfenceworks.com"
                        />
                        {(!formData.emailProvider || formData.emailProvider === 'resend') && 
                         (formData.fromEmail?.includes('send.lonestarfenceworks.com') || formData.replyToEmail?.includes('send.lonestarfenceworks.com')) && (
                          <div id="reply-to-domain-warning" className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs font-semibold leading-relaxed mt-2 shadow-sm">
                            ⚠️ Replies should go to a regular mailbox such as bradens@lonestarfenceworks.com. Do not use the sending subdomain address as Reply-To unless inbound receiving is configured.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3 bg-[#FAF9F6] p-4 rounded-xl border border-[#EBEAE4]">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1a1a1a]">
                        <input
                          type="checkbox"
                          checked={!!formData.sendCopyBccToAdmin}
                          onChange={(e) => setFormData({ ...formData, sendCopyBccToAdmin: e.target.checked })}
                          className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue"
                        />
                        <span>BCC copy to Braden (Admin)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1a1a1a]">
                        <input
                          type="checkbox"
                          checked={!!formData.enableEmailEventTracking}
                          onChange={(e) => setFormData({ ...formData, enableEmailEventTracking: e.target.checked })}
                          className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue"
                        />
                        <span>Enable Event Tracking</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#1a1a1a]">
                        <input
                          type="checkbox"
                          checked={!!formData.enableResendWebhook}
                          onChange={(e) => setFormData({ ...formData, enableResendWebhook: e.target.checked })}
                          className="rounded border-[#D5D5D5] text-american-blue focus:ring-american-blue"
                        />
                        <span>Enable Resend Webhook Feedback</span>
                      </label>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Presets selectors */}
                    <div className="space-y-3">
                      <label className="block text-xs font-bold uppercase text-[#666666] tracking-widest">
                        Email Network Presets
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        {Object.keys(smtpPresets).map((pKey) => (
                          <button
                            key={pKey}
                            type="button"
                            onClick={() => handlePresetSelect(pKey)}
                            className={`px-3 py-2 border text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all ${
                              selectedPreset === pKey 
                                ? 'border-american-blue bg-american-blue text-white shadow-sm' 
                                : 'border-[#D5D5D5] bg-[#F9F9F9] hover:bg-slate-50 text-[#1A1A1A] hover:border-slate-400'
                            }`}
                          >
                            {pKey === 'zenbusiness' ? 'ZenBusiness' : 
                             pKey === 'gmail' ? 'Google Workspace' : 
                             pKey === 'outlook' ? 'Outlook' : 
                             pKey === 'godaddy' ? 'GoDaddy' : 'Custom'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Parameters inputs */}
                    <div className="grid gap-6 md:grid-cols-3">
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">SMTP Host Address</label>
                        <input 
                          type="text" 
                          value={formData.smtpHost}
                          onChange={(e) => {
                            setFormData({...formData, smtpHost: e.target.value});
                            setSelectedPreset('custom');
                          }}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="smtp.example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">SMTP Port</label>
                        <input 
                          type="text" 
                          value={formData.smtpPort}
                          onChange={(e) => {
                            setFormData({...formData, smtpPort: e.target.value});
                            setSelectedPreset('custom');
                          }}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="465"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Secure Type</label>
                        <select
                          value={formData.smtpSecureType}
                          onChange={(e) => {
                            setFormData({...formData, smtpSecureType: e.target.value as any});
                            setSelectedPreset('custom');
                          }}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                        >
                          <option value="SSL/TLS">SSL/TLS (Port 465)</option>
                          <option value="STARTTLS">STARTTLS (Port 587)</option>
                          <option value="None">None (Unsecured)</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">SMTP Username</label>
                        <input 
                          type="text" 
                          value={formData.smtpUsername}
                          onChange={(e) => setFormData({...formData, smtpUsername: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="sender@brand.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">SMTP Password</label>
                        <input 
                          type="password" 
                          value={formData.smtpPassword}
                          onChange={(e) => setFormData({...formData, smtpPassword: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Friendly Sender Name</label>
                        <input 
                          type="text" 
                          value={formData.fromName}
                          onChange={(e) => setFormData({...formData, fromName: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="Lone Star Fence Estimator"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">From Email Address</label>
                        <input 
                          type="text" 
                          value={formData.fromEmail}
                          onChange={(e) => setFormData({...formData, fromEmail: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="office@yourcompany.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Reply-To Address</label>
                        <input 
                          type="text" 
                          value={formData.replyToEmail}
                          onChange={(e) => setFormData({...formData, replyToEmail: e.target.value})}
                          className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                          placeholder="office@yourcompany.com"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Connection verification checker */}
                <div className="p-6 bg-[#FAF9F6] rounded-2xl border border-[#EBEAE4] space-y-4">
                  <div className="flex items-center gap-2 pb-1 boundary">
                    <Send size={15} />
                    <span className="text-xs font-bold uppercase text-[#666] tracking-wider">SMTP Diagnostic Verification Channel</span>
                  </div>
                  <p className="text-2xs text-[#777] font-bold">Dispatch test handshakes to verify host parameters and receive direct diagnostic stack response traces upon errors.</p>
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    <input 
                      type="email"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      className="w-full sm:max-w-xs rounded-xl border border-[#D5D5D5] bg-white px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-american-blue transition-all"
                      placeholder="Enter verification email address"
                    />
                    <button
                      type="button"
                      onClick={handleSendTestEmail}
                      disabled={isSendingTest}
                      className="py-2.5 px-5 bg-[#333] hover:bg-[#222] disabled:opacity-50 text-white rounded-xl text-xs font-semibold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                    >
                      {isSendingTest ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          Testing Host...
                        </>
                      ) : (
                        <>
                          <Send size={12} />
                          Send Connection Test
                        </>
                      )}
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    {testSuccess && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2.5 shadow-sm"
                      >
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-emerald-900 mb-1">✓ Connection Verified Successfully!</p>
                          {testSuccess.trim().startsWith('{') ? (
                            <pre className="p-3 bg-white/60 border border-emerald-100 rounded-lg text-[10px] font-mono whitespace-pre-wrap select-all overflow-x-auto leading-relaxed text-emerald-950 mt-2 shadow-inner">
                              {testSuccess}
                            </pre>
                          ) : (
                            <span className="font-medium whitespace-pre-wrap">{testSuccess}</span>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {testError && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-start gap-2.5 shadow-sm"
                      >
                        <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-red-900 mb-1">⚠️ Connection Test Failure Details</p>
                          {testError.trim().startsWith('{') ? (
                            <pre className="p-3 bg-white/60 border border-red-100 rounded-lg text-[10px] font-mono whitespace-pre-wrap select-all overflow-x-auto leading-relaxed text-red-950 mt-2 shadow-inner">
                              {testError}
                            </pre>
                          ) : (
                            <span className="font-medium whitespace-pre-wrap">{testError}</span>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {activeSection === 'templates' && (
              <div className="space-y-8">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Settings2 className="text-american-blue" size={18} />
                  <h3 className="text-sm font-bold text-american-blue uppercase tracking-widest">
                    Customer Email Subject & Message Templates
                  </h3>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Estimate email Subject</label>
                    <input 
                      type="text"
                      value={formData.estimateEmailSubject}
                      onChange={(e) => setFormData({...formData, estimateEmailSubject: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-sans"
                      placeholder="Fence Installation Contract Agreement - {companyName}"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Estimate Email Body Message</label>
                      <span className="text-[9px] font-bold text-gray-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        Supports: &#123;customerName&#125;, &#123;estimateNumber&#125;, &#123;estimateLink&#125;, &#123;companyName&#125;
                      </span>
                    </div>
                    <textarea 
                      rows={6}
                      value={formData.estimateEmailBody}
                      onChange={(e) => setFormData({...formData, estimateEmailBody: e.target.value})}
                      className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all font-mono"
                      placeholder="Hello {customerName},&#10;&#10;We have compiled and drafted your fencing contract agreement. Please review pricing and sign the warranty agreement directly using this link: {estimateLink}&#10;&#10;Best regards,&#10;{companyName}"
                    />
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Accepted screen Success message</label>
                      <textarea 
                        rows={3}
                        value={formData.estimateAcceptedMessage}
                        onChange={(e) => setFormData({...formData, estimateAcceptedMessage: e.target.value})}
                        className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                        placeholder="Estimate accepted successfully! We will finalize your installation timeframe shortly."
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase text-[#666666] tracking-wider">Declined screen feedback message</label>
                      <textarea 
                        rows={3}
                        value={formData.estimateDeclinedMessage}
                        onChange={(e) => setFormData({...formData, estimateDeclinedMessage: e.target.value})}
                        className="block w-full rounded-xl border border-[#D5D5D5] bg-[#F9F9F9] px-4 py-2.5 text-xs text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-american-blue focus:bg-white transition-all"
                        placeholder="Estimate declined. We will reach out shortly to verify how we can accommodate your requests. Thank you!"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-20 w-20 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[#999999] mb-4">
                  <Bell size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#1A1A1A]">Notification Settings</h3>
                <p className="text-[#666666] mt-2">Configure how you receive alerts and reports.</p>
                <button className="mt-6 px-6 py-2 rounded-xl border border-[#E5E5E5] text-xs font-bold uppercase tracking-wider hover:border-[#1A1A1A] transition-all">
                  Coming Soon
                </button>
              </div>
            )}

            {/* Danger Zone */}
            <div className="pt-8 mt-8 border-t border-red-100 space-y-4">
              <h3 className="text-sm font-black text-american-red uppercase tracking-widest">Danger Zone</h3>
              <div className="p-6 rounded-2xl bg-red-50 border border-red-100 flex flex-col sm:flex-row items-center justify-between gap-6">
                <div>
                  <h4 className="text-sm font-bold text-red-900 line-clamp-1">Reset Application Data</h4>
                  <p className="text-xs text-red-700 mt-1">This will permanently delete all custom materials, quotes, and saved estimates from this device.</p>
                </div>
                <button 
                  onClick={() => {
                    if (confirm('Are you absolutely sure? This cannot be undone.')) {
                      localStorage.clear();
                      window.location.reload();
                    }
                  }}
                  className="shrink-0 px-6 py-3 bg-white border-2 border-red-200 text-red-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 hover:text-white hover:border-red-600 transition-all shadow-sm"
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {showSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-8 right-8 bg-american-blue text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50"
        >
          <CheckCircle2 className="text-[#00FF00]" size={20} />
          <span className="font-bold">Settings saved successfully!</span>
        </motion.div>
      )}

      {showConfirmCreateCustomFieldsModal && (
        <div id="confirm-create-fields-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 w-full max-w-lg shadow-xl space-y-6">
            <div className="space-y-2">
              <h3 className="text-base font-bold text-slate-900">Create Missing GoHighLevel Fields?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                The app will create the following Contact Custom Fields in GoHighLevel:
              </p>
            </div>
            
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 max-h-60 overflow-y-auto">
              <ul className="text-xs text-slate-700 font-medium space-y-1.5 list-disc pl-4">
                <li>Estimate ID</li>
                <li>Estimate Number</li>
                <li>Estimate Contract Link</li>
                <li>Estimated Total</li>
                <li>Fence Type</li>
                <li>Linear Feet</li>
                <li>Job Status</li>
                <li>Estimator Submitted Date</li>
                <li>Last Estimate Sent Date</li>
                <li>Contract Accepted Date</li>
                <li>Contract Declined Date</li>
                <li>Project Scheduled Start Date</li>
                <li>Project Completed Date</li>
              </ul>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmCreateCustomFieldsModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCreatingFields}
                onClick={handleCreateMissingFields}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {isCreatingFields ? (
                  <>
                    <RefreshCw className="animate-spin animate-spin-slow" size={12} /> Creating...
                  </>
                ) : (
                  "Create Fields"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
