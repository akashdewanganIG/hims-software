export const INTEGRATIONS_PREVIEW_VERSION = 1;
export const INTEGRATIONS_PREVIEW_KEY = "hims.integrations.preview.v1";

export type IntegrationCategory =
  | "MESSAGING"
  | "OCR"
  | "CLINICAL"
  | "ABDM"
  | "PAYMENTS"
  | "INSURANCE"
  | "ACCOUNTING";
export type IntegrationStatus =
  "CONNECTED" | "DISCONNECTED" | "DEGRADED" | "TESTING";

export interface IntegrationProvider {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  capabilities: string[];
  environment: "Local" | "Sandbox" | "Production preview";
  configurationFields: string[];
  lockedConnected?: boolean;
}

export interface IntegrationLog {
  id: string;
  providerId: string;
  at: string;
  outcome: "INFO" | "SUCCESS" | "ERROR";
  message: string;
}

export interface IntegrationsPreviewState {
  version: 1;
  providers: Record<
    string,
    {
      status: IntegrationStatus;
      enabled: boolean;
      configured: boolean;
      lastCheckedAt?: string;
    }
  >;
  routes: Record<string, { primary: string; fallback?: string }>;
  logs: IntegrationLog[];
}

export const INTEGRATION_CATEGORIES: {
  id: IntegrationCategory;
  label: string;
  description: string;
}[] = [
  {
    id: "MESSAGING",
    label: "Messaging",
    description: "Patient notifications and feedback links",
  },
  {
    id: "OCR",
    label: "OCR & documents",
    description: "Local and external document extraction",
  },
  {
    id: "CLINICAL",
    label: "Clinical systems",
    description: "PACS, RIS, HL7/FHIR, LIS and analysers",
  },
  {
    id: "ABDM",
    label: "ABDM & registries",
    description: "ABHA, HIP/HIU and registry connectivity",
  },
  {
    id: "PAYMENTS",
    label: "Payments",
    description: "Gateway collection and reconciliation",
  },
  {
    id: "INSURANCE",
    label: "Insurance",
    description: "NHCX, insurer and TPA exchanges",
  },
  {
    id: "ACCOUNTING",
    label: "Accounting",
    description: "Tally and ERP export routes",
  },
];

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    id: "whatsapp-meta",
    name: "WhatsApp Business Cloud",
    category: "MESSAGING",
    description: "Template messages and feedback-link delivery preview.",
    capabilities: ["Templates", "Delivery webhooks", "Fallback routing"],
    environment: "Sandbox",
    configurationFields: [
      "Phone number ID",
      "Business account ID",
      "Access token",
    ],
  },
  {
    id: "sms-msg91",
    name: "MSG91 SMS",
    category: "MESSAGING",
    description: "India-first transactional SMS route preview.",
    capabilities: ["DLT templates", "OTP", "Delivery receipts"],
    environment: "Sandbox",
    configurationFields: ["Auth key", "Sender ID", "DLT entity ID"],
  },
  {
    id: "sms-twilio",
    name: "Twilio SMS",
    category: "MESSAGING",
    description: "International SMS fallback preview.",
    capabilities: ["SMS", "Status callbacks", "Fallback"],
    environment: "Sandbox",
    configurationFields: ["Account SID", "Auth token", "From number"],
  },
  {
    id: "email-smtp",
    name: "SMTP Email",
    category: "MESSAGING",
    description: "Transactional email configuration preview.",
    capabilities: ["Email", "TLS", "Templates"],
    environment: "Production preview",
    configurationFields: ["Host", "Username", "Password"],
  },
  {
    id: "ocr-tesseract",
    name: "Tesseract (local)",
    category: "OCR",
    description: "The application’s active local OCR engine.",
    capabilities: ["Local processing", "No cloud upload", "English & Hindi"],
    environment: "Local",
    configurationFields: [],
    lockedConnected: true,
  },
  {
    id: "ocr-google",
    name: "Google Document AI",
    category: "OCR",
    description: "External structured-document extraction route preview.",
    capabilities: ["Forms", "Tables", "Custom processors"],
    environment: "Sandbox",
    configurationFields: ["Project ID", "Processor ID", "Service account JSON"],
  },
  {
    id: "ocr-azure",
    name: "Azure Document Intelligence",
    category: "OCR",
    description: "External document intelligence route preview.",
    capabilities: ["Layout", "Invoices", "Custom models"],
    environment: "Sandbox",
    configurationFields: ["Endpoint", "API key", "Model ID"],
  },
  {
    id: "ocr-textract",
    name: "AWS Textract",
    category: "OCR",
    description: "External forms and table extraction route preview.",
    capabilities: ["Forms", "Tables", "Queries"],
    environment: "Sandbox",
    configurationFields: ["Region", "Access key ID", "Secret access key"],
  },
  {
    id: "pacs-dicomweb",
    name: "PACS / DICOMweb",
    category: "CLINICAL",
    description: "QIDO-RS, WADO-RS and STOW-RS study exchange preview.",
    capabilities: ["DICOMweb", "Study launch", "Metadata query"],
    environment: "Sandbox",
    configurationFields: ["Base URL", "Client ID", "Client secret"],
  },
  {
    id: "ris-hl7",
    name: "RIS / HL7 v2",
    category: "CLINICAL",
    description: "Order, schedule and result interface preview.",
    capabilities: ["ORM", "ORU", "ADT"],
    environment: "Sandbox",
    configurationFields: ["MLLP host", "Port", "Facility code"],
  },
  {
    id: "fhir-r4",
    name: "FHIR R4 Server",
    category: "CLINICAL",
    description:
      "ServiceRequest, ImagingStudy and DiagnosticReport exchange preview.",
    capabilities: ["FHIR R4", "OAuth 2.0", "Subscriptions"],
    environment: "Sandbox",
    configurationFields: ["Base URL", "Client ID", "Client secret"],
  },
  {
    id: "lis-analyser",
    name: "LIS / Analyser Gateway",
    category: "CLINICAL",
    description: "Laboratory order/result and analyser connectivity preview.",
    capabilities: ["HL7", "ASTM", "Bidirectional"],
    environment: "Sandbox",
    configurationFields: ["Gateway URL", "Facility code", "Shared secret"],
  },
  {
    id: "abdm-gateway",
    name: "ABDM Gateway",
    category: "ABDM",
    description:
      "ABHA discovery, linking, consent and health-information exchange preview.",
    capabilities: ["ABHA", "HIP/HIU", "Consent manager"],
    environment: "Sandbox",
    configurationFields: ["Client ID", "Client secret", "HIP ID"],
  },
  {
    id: "abdm-registry",
    name: "HFR / HPR Registries",
    category: "ABDM",
    description: "Facility and professional registry verification preview.",
    capabilities: ["HFR", "HPR", "Registry lookup"],
    environment: "Sandbox",
    configurationFields: ["Facility ID", "Client ID", "Client secret"],
  },
  {
    id: "payment-razorpay",
    name: "Razorpay",
    category: "PAYMENTS",
    description: "Payment link, collection and reconciliation preview.",
    capabilities: ["UPI", "Cards", "Webhooks", "Refunds"],
    environment: "Sandbox",
    configurationFields: ["Key ID", "Key secret", "Webhook secret"],
  },
  {
    id: "insurance-nhcx",
    name: "NHCX",
    category: "INSURANCE",
    description: "Digital claim exchange preview.",
    capabilities: ["Eligibility", "Pre-authorisation", "Claims"],
    environment: "Sandbox",
    configurationFields: ["Participant ID", "Signing key", "Encryption key"],
  },
  {
    id: "insurance-tpa",
    name: "Insurer / TPA Gateway",
    category: "INSURANCE",
    description: "Configurable payer and TPA route preview.",
    capabilities: ["Pre-auth", "Claims", "Documents"],
    environment: "Sandbox",
    configurationFields: ["Endpoint", "Payer code", "API key"],
  },
  {
    id: "accounting-tally",
    name: "Tally Export",
    category: "ACCOUNTING",
    description: "Voucher and ledger export preview.",
    capabilities: ["XML export", "Ledgers", "Cost centres"],
    environment: "Local",
    configurationFields: ["Company name", "Ledger mapping", "Export path"],
  },
  {
    id: "accounting-erp",
    name: "ERP Connector",
    category: "ACCOUNTING",
    description: "Generic finance and inventory export preview.",
    capabilities: ["REST", "Scheduled export", "Reconciliation"],
    environment: "Sandbox",
    configurationFields: ["Base URL", "Tenant", "API key"],
  },
];

export function createDefaultIntegrationsPreviewState(): IntegrationsPreviewState {
  return {
    version: 1,
    providers: Object.fromEntries(
      INTEGRATION_PROVIDERS.map(provider => [
        provider.id,
        {
          status: provider.lockedConnected ? "CONNECTED" : "DISCONNECTED",
          enabled: Boolean(provider.lockedConnected),
          configured: Boolean(provider.lockedConnected),
        },
      ])
    ),
    routes: {
      whatsapp: { primary: "whatsapp-meta" },
      sms: { primary: "sms-msg91", fallback: "sms-twilio" },
      ocr: { primary: "ocr-tesseract" },
      imaging: { primary: "pacs-dicomweb", fallback: "fhir-r4" },
    },
    logs: [
      {
        id: "preview-ready",
        providerId: "ocr-tesseract",
        at: new Date().toISOString(),
        outcome: "SUCCESS",
        message: "Local Tesseract OCR is available.",
      },
    ],
  };
}

export function readMessagingProviderLabels(): {
  whatsapp: string;
  sms: string;
} {
  const fallback = { whatsapp: "WhatsApp Business Cloud", sms: "MSG91 SMS" };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(INTEGRATIONS_PREVIEW_KEY) ?? "null"
    ) as IntegrationsPreviewState | null;
    if (!parsed || parsed.version !== INTEGRATIONS_PREVIEW_VERSION)
      return fallback;
    const name = (id?: string) =>
      INTEGRATION_PROVIDERS.find(provider => provider.id === id)?.name;
    return {
      whatsapp: name(parsed.routes.whatsapp?.primary) ?? fallback.whatsapp,
      sms: name(parsed.routes.sms?.primary) ?? fallback.sms,
    };
  } catch {
    return fallback;
  }
}
