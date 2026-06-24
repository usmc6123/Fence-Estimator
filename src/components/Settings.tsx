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
              <GhlIntegrationCenter
                formData={formData}
                setFormData={setFormData}
                onSave={handleSave}
                missingCustomFieldsList={missingCustomFieldsList}
                onAutoConfigureCustomFields={handleCreateMissingFields}
                onLoadGhlData={handleLoadGhlData}
                autoConfigSuccess={autoConfigSuccess}
                ghlLoadError={ghlLoadError}
              />
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
