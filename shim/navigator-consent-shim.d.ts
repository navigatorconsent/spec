export type ConsentDecision = "grant" | "deny" | "unset";
export type ConsentEventType = "update" | "hide" | "show" | "withdraw" | "audit" | "init" | "regulation_change" | "consent_request";
export type LegalBasis = "consent" | "legitimate_interest";

export interface InterfaceRegistration {
  vendor: string;
  prompt?: string;
  regulation?: string;
  jurisdiction?: string;
  versionIdentifier: string;
  cmpId?: string;
}

export interface Vendor {
  id: string;
  name: string;
  domain: string;
  privacyPolicyUrl: string;
  purposeIds?: string[];
  additionalIDs?: Record<string, string>;
  description?: string;
}

export interface Purpose {
  id: string;
  name: string;
  legalBasis?: LegalBasis;
  additionalIDs?: Record<string, string>;
  description?: string;
}

export interface RegulationInfo {
  regulations: string[];
  jurisdiction: string | null;
  source: "browser" | "privacy_assistant" | "user";
  browserDefault: {
    regulations: string[];
    jurisdiction: string | null;
  } | null;
}

export interface PreferenceUpdate {
  registrationId?: string;
  domain?: string;
  vendors?: Record<string, ConsentDecision>;
  purposes?: Record<string, ConsentDecision>;
  source?: "cmp" | "privacy_assistant" | "user";
  reason?: string;
}

export interface ConsentSnapshot {
  registrationId: string;
  domain: string;
  vendors: Record<string, ConsentDecision>;
  purposes: Record<string, ConsentDecision>;
  updatedAt: string;
}

export interface ConsentEvent {
  type: ConsentEventType;
  timestamp: string;
  registrationId?: string;
  domain?: string;
  source?: "cmp" | "privacy_assistant" | "browser" | "user";
  payload?: unknown;
}

export interface ConsentAuditRecord {
  recordId: string;
  timestamp: string;
  type: ConsentEventType;
  registrationId?: string;
  domain?: string;
  source?: "cmp" | "privacy_assistant" | "browser" | "user";
  topLevelOrigin?: string;
  frameOrigin?: string;
  scriptOrigin?: string;
  changes?: {
    vendors?: Record<string, ConsentDecision>;
    purposes?: Record<string, ConsentDecision>;
  };
  warning?: {
    kind?: string;
    reasonCode?: string;
    message?: string;
    details?: Record<string, unknown>;
    [key: string]: unknown;
  };
  reason?: string;
}

export interface NavigatorConsent {
  registerInterface(payload: InterfaceRegistration): Promise<{ registrationId: string }>;
  registerVendors(vendors: Array<Vendor | string>, options?: { registrationId?: string }): Promise<{ count: number }>;
  registerPurposes(
    purposes: Array<Purpose | string>,
    options?: { registrationId?: string }
  ): Promise<{ count: number }>;
  requestConsent(request?: {
    registrationId?: string;
    vendorIds?: string[];
    purposeIds?: string[];
    reason?: string;
  }): Promise<ConsentSnapshot>;
  updatePreferences(update: PreferenceUpdate): Promise<ConsentSnapshot>;
  withdraw(scope?: {
    registrationId?: string;
    vendorIds?: string[];
    purposeIds?: string[];
    reason?: string;
  }): Promise<ConsentSnapshot>;

  getVendors(filter?: { registrationId?: string; domain?: string }): Promise<Vendor[]>;
  getPurposes(filter?: { registrationId?: string; domain?: string }): Promise<Purpose[]>;
  hide(target?: { registrationId?: string; reason?: string }): Promise<void>;
  show(target?: { registrationId?: string; reason?: string }): Promise<void>;
  audit(query?: {
    registrationId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<ConsentAuditRecord[]>;
  init(metadata?: { assistantId?: string; version?: string; displayName?: string }): Promise<void>;

  getRegulations(): Promise<RegulationInfo>;
  setRegulations(options: {
    regulations?: string[];
    jurisdiction?: string | null;
  }): Promise<RegulationInfo>;

  addEventListener(type: ConsentEventType, listener: (event: ConsentEvent) => void): void;
  removeEventListener(type: ConsentEventType, listener: (event: ConsentEvent) => void): void;
}

declare global {
  interface Navigator {
    consent: NavigatorConsent;
  }

  interface Window {
    __navigatorConsentExtensionContext?: boolean;
  }
}
