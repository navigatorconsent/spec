(function initNavigatorConsentShim(global) {
  "use strict";

  if (!global || !global.navigator) {
    return;
  }

  if (global.navigator.consent) {
    return;
  }

  var EVENT_TYPES = ["update", "hide", "show", "withdraw", "audit", "init", "regulation_change", "consent_request"];
  var DECISIONS = ["grant", "deny", "unset"];
  var LEGAL_BASIS = ["consent", "legitimate_interest"];
  var LIMITS = {
    MAX_REGISTRATIONS_PER_TOP_LEVEL: 12,
    MAX_REGISTRATIONS_PER_FRAME: 6,
    MAX_REGISTRATION_CALLS_PER_WINDOW_PER_FRAME: 20,
    MAX_CATALOG_ITEMS_PER_CALL: 250,
    MAX_CATALOG_ITEMS_PER_REGISTRATION: 2000,
    MAX_DECISION_KEYS_PER_CALL: 1000,
    MAX_IDENTIFIER_LENGTH: 128,
    MAX_TEXT_LENGTH: 512,
    MAX_LONG_TEXT_LENGTH: 4096,
    MAX_REASON_LENGTH: 512,
    MAX_AUDIT_RECORDS: 5000,
    MAX_AUDIT_QUERY_LIMIT: 500,
    RATE_WINDOW_MS: 10000,
    MAX_MUTATIONS_PER_WINDOW_PER_FRAME: 120,
    MAX_MUTATIONS_PER_WINDOW_PER_REGISTRATION: 60
  };

  var state = {
    sequence: 0,
    registrations: new Map(),
    cmpIdToRegistrationId: new Map(),
    audit: [],
    listeners: new Map(),
    rateBuckets: new Map(),
    defaultRegistrationId: null,
    regulation: {
      browserDefault: null,
      override: null
    }
  };

  EVENT_TYPES.forEach(function (type) {
    state.listeners.set(type, new Set());
  });

  function createError(name, code, message, details) {
    var err = new Error(message || name);
    err.name = name;
    err.code = code;
    if (details) {
      err.details = details;
    }
    return err;
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getCurrentDomain() {
    if (global.location && typeof global.location.hostname === "string") {
      return global.location.hostname;
    }
    return "unknown";
  }

  function getFrameOrigin() {
    try {
      if (global.location && typeof global.location.origin === "string" && global.location.origin) {
        return global.location.origin;
      }
    } catch (err) {
      return "opaque-origin";
    }
    return "unknown-origin";
  }

  function getTopLevelOrigin() {
    try {
      if (global.top && global.top.location && typeof global.top.location.origin === "string") {
        return global.top.location.origin;
      }
    } catch (err) {
      return "cross-origin-top";
    }
    return getFrameOrigin();
  }

  function getScriptOrigin() {
    try {
      if (global.document && global.document.currentScript && global.document.currentScript.src) {
        return new URL(global.document.currentScript.src, global.location && global.location.href).origin;
      }
    } catch (err) {
      return "unknown-script-origin";
    }
    return "inline-script";
  }

  function buildProvenance() {
    return {
      topLevelOrigin: getTopLevelOrigin(),
      frameOrigin: getFrameOrigin(),
      scriptOrigin: getScriptOrigin()
    };
  }

  function inferSource() {
    return isExtensionContext() ? "privacy_assistant" : "cmp";
  }

  function buildScopeDetails(registrationId, extraDetails) {
    var provenance = buildProvenance();
    var details = {
      topLevelOrigin: provenance.topLevelOrigin,
      frameOrigin: provenance.frameOrigin
    };
    if (registrationId) {
      details.registrationId = registrationId;
    }
    if (isObject(extraDetails)) {
      Object.keys(extraDetails).forEach(function (key) {
        details[key] = extraDetails[key];
      });
    }
    return details;
  }

  function recordAntiSpamWarning(reasonCode, message, details, context) {
    var source = context && context.source ? context.source : inferSource();
    var registration = context && context.registration ? context.registration : null;
    var registrationId =
      (context && context.registrationId) || (registration && registration.registrationId) || undefined;
    var domain = (context && context.domain) || (registration && registration.domain) || getCurrentDomain();
    var warning = {
      kind: "anti_spam",
      reasonCode: reasonCode,
      message: message,
      details: details
    };

    pushAuditRecord({
      recordId: "rec_" + (++state.sequence),
      timestamp: nowIso(),
      type: "audit",
      registrationId: registrationId,
      domain: domain,
      source: source,
      warning: warning
    });

    emit("audit", warning, source, registrationId, domain);
  }

  function raiseAntiSpamError(errorName, reasonCode, message, controlCategory, extraDetails, context) {
    var registration = context && context.registration ? context.registration : null;
    var registrationId =
      (context && context.registrationId) || (registration && registration.registrationId) || undefined;
    var details = buildScopeDetails(
      registrationId,
      Object.assign(
        {
          controlCategory: controlCategory
        },
        extraDetails || {}
      )
    );
    recordAntiSpamWarning(reasonCode, message, details, context);
    throw createError(errorName, reasonCode, message, details);
  }

  function consumeRateBucket(bucketKey, limit, windowMs) {
    var now = Date.now();
    var bucket = state.rateBuckets.get(bucketKey);
    if (!bucket) {
      bucket = [];
      state.rateBuckets.set(bucketKey, bucket);
    }

    while (bucket.length && now - bucket[0] >= windowMs) {
      bucket.shift();
    }

    if (bucket.length >= limit) {
      return false;
    }

    bucket.push(now);
    return true;
  }

  function enforceRateLimit(operation, bucketKey, limit, context) {
    if (consumeRateBucket(bucketKey, limit, LIMITS.RATE_WINDOW_MS)) {
      return;
    }

    raiseAntiSpamError(
      "RateLimitError",
      "RATE_LIMIT",
      operation + " exceeded rate limit.",
      "mutation_rate_limit",
      {
        operation: operation,
        bucketKey: bucketKey,
        limit: limit,
        windowMs: LIMITS.RATE_WINDOW_MS
      },
      context
    );
  }

  function enforceMutationRate(operation, registration, source) {
    var provenance = buildProvenance();
    var context = {
      source: source,
      registration: registration
    };
    var frameKey = provenance.topLevelOrigin + "|" + provenance.frameOrigin;
    enforceRateLimit(
      operation,
      "mutation:frame:" + frameKey,
      LIMITS.MAX_MUTATIONS_PER_WINDOW_PER_FRAME,
      context
    );
    if (registration && registration.registrationId) {
      enforceRateLimit(
        operation,
        "mutation:registration:" + registration.registrationId,
        LIMITS.MAX_MUTATIONS_PER_WINDOW_PER_REGISTRATION,
        context
      );
    }
  }

  function enforceRegistrationQuota(existingRegistrationId, source) {
    var provenance = buildProvenance();
    var frameKey = provenance.topLevelOrigin + "|" + provenance.frameOrigin;
    var context = {
      source: source
    };

    enforceRateLimit(
      "registerInterface",
      "registration:frame:" + frameKey,
      LIMITS.MAX_REGISTRATION_CALLS_PER_WINDOW_PER_FRAME,
      context
    );

    if (existingRegistrationId) {
      return provenance;
    }

    var topLevelCount = 0;
    var frameCount = 0;
    state.registrations.forEach(function (registration) {
      var registrationProvenance = registration.provenance || {};
      if (registrationProvenance.topLevelOrigin === provenance.topLevelOrigin) {
        topLevelCount += 1;
      }
      if (
        registrationProvenance.topLevelOrigin === provenance.topLevelOrigin &&
        registrationProvenance.frameOrigin === provenance.frameOrigin
      ) {
        frameCount += 1;
      }
    });

    if (topLevelCount >= LIMITS.MAX_REGISTRATIONS_PER_TOP_LEVEL) {
      raiseAntiSpamError(
        "RateLimitError",
        "REGISTRATION_QUOTA",
        "Top-level registration quota exceeded.",
        "registration_quota",
        {
          limitKind: "top_level",
          limit: LIMITS.MAX_REGISTRATIONS_PER_TOP_LEVEL,
          current: topLevelCount
        },
        context
      );
    }

    if (frameCount >= LIMITS.MAX_REGISTRATIONS_PER_FRAME) {
      raiseAntiSpamError(
        "RateLimitError",
        "REGISTRATION_QUOTA",
        "Frame registration quota exceeded.",
        "registration_quota",
        {
          limitKind: "frame",
          limit: LIMITS.MAX_REGISTRATIONS_PER_FRAME,
          current: frameCount
        },
        context
      );
    }

    return provenance;
  }

  function enforceStringLength(value, fieldName, maxLength, context) {
    if (typeof value !== "string") {
      return;
    }
    if (value.length <= maxLength) {
      return;
    }
    raiseAntiSpamError(
      "ValidationError",
      "PAYLOAD_TOO_LARGE",
      fieldName + " exceeds maximum length.",
      "payload_caps",
      {
        field: fieldName,
        providedLength: value.length,
        maxLength: maxLength
      },
      context
    );
  }

  function enforceArraySize(value, fieldName, maxItems, context) {
    if (!Array.isArray(value)) {
      return;
    }
    if (value.length <= maxItems) {
      return;
    }
    raiseAntiSpamError(
      "ValidationError",
      "PAYLOAD_TOO_LARGE",
      fieldName + " exceeds maximum item count.",
      "payload_caps",
      {
        field: fieldName,
        providedItems: value.length,
        maxItems: maxItems
      },
      context
    );
  }

  function validateIdentifierArray(value, fieldName, context) {
    if (value === undefined) {
      return;
    }
    if (!Array.isArray(value)) {
      throw createError(
        "ValidationError",
        "INVALID_" + fieldName.toUpperCase(),
        fieldName + " must be an array when provided."
      );
    }
    enforceArraySize(value, fieldName, LIMITS.MAX_DECISION_KEYS_PER_CALL, context);
    value.forEach(function (item) {
      if (typeof item !== "string" || item.length === 0) {
        throw createError(
          "ValidationError",
          "INVALID_" + fieldName.toUpperCase(),
          fieldName + " values must be non-empty strings."
        );
      }
      enforceStringLength(item, fieldName + "[]", LIMITS.MAX_IDENTIFIER_LENGTH, context);
    });
  }

  function isExtensionContext() {
    if (global.__navigatorConsentExtensionContext === true) {
      return true;
    }

    try {
      return Boolean(
        global.chrome &&
          global.chrome.runtime &&
          typeof global.chrome.runtime.id === "string" &&
          global.chrome.runtime.id.length > 0
      );
    } catch (err) {
      return false;
    }
  }

  function assertDomContext(methodName) {
    if (isExtensionContext()) {
      throw createError(
        "NotAllowedError",
        "NOT_ALLOWED_CONTEXT",
        methodName + " cannot be called from extension context."
      );
    }
  }

  function assertExtensionContext(methodName) {
    if (!isExtensionContext()) {
      throw createError(
        "NotAllowedError",
        "NOT_ALLOWED_CONTEXT",
        methodName + " can only be called from extension context."
      );
    }
  }

  function validateDecisionMap(input, fieldName, context) {
    if (input === undefined) {
      return;
    }
    if (!isObject(input)) {
      throw createError(
        "ValidationError",
        "INVALID_DECISION_MAP",
        fieldName + " must be an object map."
      );
    }
    var keys = Object.keys(input);
    enforceArraySize(keys, fieldName, LIMITS.MAX_DECISION_KEYS_PER_CALL, context);
    keys.forEach(function (key) {
      enforceStringLength(key, fieldName + " key", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      var value = input[key];
      if (DECISIONS.indexOf(value) === -1) {
        throw createError(
          "ValidationError",
          "INVALID_DECISION",
          fieldName + " contains invalid decision: " + String(value),
          { key: key, value: value }
        );
      }
    });
  }

  function normalizeCatalogItem(item, itemName, context) {
    if (typeof item === "string" && item.length > 0) {
      enforceStringLength(item, itemName + ".id", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      return {
        id: item
      };
    }

    if (isObject(item) && typeof item.id === "string" && item.id.length > 0) {
      enforceStringLength(item.id, itemName + ".id", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      enforceStringLength(item.name, itemName + ".name", LIMITS.MAX_TEXT_LENGTH, context);
      enforceStringLength(item.description, itemName + ".description", LIMITS.MAX_LONG_TEXT_LENGTH, context);
      var result = {
        id: item.id,
        name: typeof item.name === "string" ? item.name : undefined,
        description: typeof item.description === "string" ? item.description : undefined
      };
      if (isObject(item.additionalIDs)) {
        result.additionalIDs = {};
        Object.keys(item.additionalIDs).forEach(function (k) {
          if (typeof item.additionalIDs[k] === "string") {
            result.additionalIDs[k] = item.additionalIDs[k];
          }
        });
      }
      if (itemName === "vendor") {
        if (typeof item.domain === "string") result.domain = item.domain;
        if (typeof item.privacyPolicyUrl === "string") result.privacyPolicyUrl = item.privacyPolicyUrl;
        if (Array.isArray(item.purposeIds)) result.purposeIds = item.purposeIds.slice();
      }
      if (itemName === "purpose" && typeof item.legalBasis === "string") {
        if (LEGAL_BASIS.indexOf(item.legalBasis) === -1) {
          throw createError("ValidationError", "INVALID_LEGAL_BASIS", "Unsupported legal basis: " + item.legalBasis);
        }
        result.legalBasis = item.legalBasis;
      }
      return result;
    }

    throw createError(
      "ValidationError",
      "INVALID_" + itemName.toUpperCase(),
      itemName + " items must be non-empty strings or objects with a non-empty string id."
    );
  }

  function requireArray(value, fieldName) {
    if (!Array.isArray(value)) {
      throw createError(
        "ValidationError",
        "INVALID_" + fieldName.toUpperCase(),
        fieldName + " must be an array."
      );
    }
  }

  function getRegistrationById(registrationId) {
    var registration = state.registrations.get(registrationId);
    if (!registration) {
      throw createError(
        "NotFoundError",
        "REGISTRATION_NOT_FOUND",
        "Unknown registrationId: " + registrationId
      );
    }
    return registration;
  }

  function resolveRegistrationId(inputRegistrationId) {
    if (inputRegistrationId) {
      return inputRegistrationId;
    }

    if (state.defaultRegistrationId) {
      return state.defaultRegistrationId;
    }

    var first = state.registrations.keys().next();
    if (first.done) {
      throw createError(
        "StateError",
        "NO_REGISTRATION",
        "No consent interface registration found. Call registerInterface first."
      );
    }

    return first.value;
  }

  function buildSnapshot(registration) {
    return {
      registrationId: registration.registrationId,
      domain: registration.domain,
      vendors: Object.assign({}, registration.preferences.vendors),
      purposes: Object.assign({}, registration.preferences.purposes),
      updatedAt: registration.updatedAt
    };
  }

  function pushAuditRecord(record) {
    var provenance = buildProvenance();
    record.topLevelOrigin = provenance.topLevelOrigin;
    record.frameOrigin = provenance.frameOrigin;
    record.scriptOrigin = provenance.scriptOrigin;
    state.audit.push(record);
    if (state.audit.length > LIMITS.MAX_AUDIT_RECORDS) {
      state.audit.splice(0, state.audit.length - LIMITS.MAX_AUDIT_RECORDS);
    }
  }

  function emit(type, payload, source, registrationId, domain) {
    var event = {
      type: type,
      timestamp: nowIso(),
      registrationId: registrationId || undefined,
      domain: domain || getCurrentDomain(),
      source: source || "browser",
      payload: payload
    };

    var listeners = state.listeners.get(type);
    if (listeners) {
      listeners.forEach(function (listener) {
        try {
          listener(event);
        } catch (err) {
          global.console && global.console.error && global.console.error(err);
        }
      });
    }

    return event;
  }

  function updateRegistrationPreferences(registration, update, source, context) {
    validateDecisionMap(update.vendors, "vendors", context);
    validateDecisionMap(update.purposes, "purposes", context);

    if (!update.vendors && !update.purposes) {
      throw createError(
        "ValidationError",
        "EMPTY_PREFERENCE_UPDATE",
        "Preference update must include vendors and/or purposes."
      );
    }

    if (update.vendors) {
      Object.keys(update.vendors).forEach(function (vendorId) {
        registration.preferences.vendors[vendorId] = update.vendors[vendorId];
      });
    }

    if (update.purposes) {
      Object.keys(update.purposes).forEach(function (purposeId) {
        registration.preferences.purposes[purposeId] = update.purposes[purposeId];
      });
    }

    registration.updatedAt = nowIso();
    var snapshot = buildSnapshot(registration);
    var warnings = [];

    var record = {
      recordId: "rec_" + (++state.sequence),
      timestamp: registration.updatedAt,
      type: "update",
      registrationId: registration.registrationId,
      domain: registration.domain,
      source: source,
      changes: {
        vendors: update.vendors || undefined,
        purposes: update.purposes || undefined
      },
      reason: update.reason || undefined
    };
    pushAuditRecord(record);

    if (source === "privacy_assistant") {
      var undeclaredVendorIds = [];
      var undeclaredPurposeIds = [];

      if (update.vendors) {
        Object.keys(update.vendors).forEach(function (vendorId) {
          if (!registration.vendors.has(vendorId)) {
            undeclaredVendorIds.push(vendorId);
          }
        });
      }

      if (update.purposes) {
        Object.keys(update.purposes).forEach(function (purposeId) {
          if (!registration.purposes.has(purposeId)) {
            undeclaredPurposeIds.push(purposeId);
          }
        });
      }

      if (undeclaredVendorIds.length || undeclaredPurposeIds.length) {
        var warning = {
          kind: "undeclared_reference",
          message:
            "Assistant referenced undeclared identifiers. Default behavior is warn and continue without forced blocking.",
          undeclaredVendorIds: undeclaredVendorIds,
          undeclaredPurposeIds: undeclaredPurposeIds
        };
        warnings.push(warning);

        pushAuditRecord({
          recordId: "rec_" + (++state.sequence),
          timestamp: nowIso(),
          type: "audit",
          registrationId: registration.registrationId,
          domain: registration.domain,
          source: "privacy_assistant",
          warning: warning
        });

        emit("audit", warning, "privacy_assistant", registration.registrationId, registration.domain);
      }
    }

    emit("update", snapshot, source, registration.registrationId, registration.domain);
    if (warnings.length) {
      snapshot.warnings = warnings;
    }
    return snapshot;
  }

  function withdrawRegistrationScope(registration, scope, source, eventType) {
    var vendorIds = Array.isArray(scope.vendorIds) ? scope.vendorIds : Object.keys(registration.preferences.vendors);
    var purposeIds = Array.isArray(scope.purposeIds) ? scope.purposeIds : Object.keys(registration.preferences.purposes);

    var vendorChanges = {};
    var purposeChanges = {};

    vendorIds.forEach(function (vendorId) {
      registration.preferences.vendors[vendorId] = "unset";
      vendorChanges[vendorId] = "unset";
    });

    purposeIds.forEach(function (purposeId) {
      registration.preferences.purposes[purposeId] = "unset";
      purposeChanges[purposeId] = "unset";
    });

    registration.updatedAt = nowIso();
    var snapshot = buildSnapshot(registration);

    pushAuditRecord({
      recordId: "rec_" + (++state.sequence),
      timestamp: registration.updatedAt,
      type: "withdraw",
      registrationId: registration.registrationId,
      domain: registration.domain,
      source: source,
      changes: {
        vendors: vendorChanges,
        purposes: purposeChanges
      },
      reason: scope.reason || undefined
    });

    emit(eventType || "withdraw", snapshot, source, registration.registrationId, registration.domain);
    return snapshot;
  }

  var consentApi = {
    registerInterface: function registerInterface(payload) {
      assertDomContext("registerInterface");
      var source = "cmp";
      var context = {
        source: source
      };
      if (!isObject(payload)) {
        throw createError("ValidationError", "INVALID_PAYLOAD", "registerInterface payload must be an object.");
      }
      if (typeof payload.vendor !== "string" || !payload.vendor) {
        throw createError("ValidationError", "INVALID_VENDOR", "registerInterface requires a non-empty vendor.");
      }
      enforceStringLength(payload.vendor, "vendor", LIMITS.MAX_TEXT_LENGTH, context);
      enforceStringLength(payload.prompt, "prompt", LIMITS.MAX_LONG_TEXT_LENGTH, context);
      enforceStringLength(payload.regulation, "regulation", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      enforceStringLength(payload.jurisdiction, "jurisdiction", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      enforceStringLength(payload.versionIdentifier, "versionIdentifier", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      enforceStringLength(payload.cmpId, "cmpId", LIMITS.MAX_IDENTIFIER_LENGTH, context);

      if (typeof payload.versionIdentifier !== "string" || !payload.versionIdentifier) {
        throw createError(
          "ValidationError",
          "INVALID_VERSION_IDENTIFIER",
          "registerInterface requires a non-empty versionIdentifier."
        );
      }

      var existingRegistrationId =
        typeof payload.cmpId === "string" && payload.cmpId ? state.cmpIdToRegistrationId.get(payload.cmpId) : null;
      var registrationProvenance = enforceRegistrationQuota(existingRegistrationId, source);
      var registrationId = existingRegistrationId || "cmp_" + (++state.sequence);
      var registration = existingRegistrationId ? getRegistrationById(existingRegistrationId) : null;

      if (!registration) {
        registration = {
          registrationId: registrationId,
          domain: getCurrentDomain(),
          metadata: {},
          vendors: new Map(),
          purposes: new Map(),
          preferences: {
            vendors: {},
            purposes: {}
          },
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
      }

      registration.metadata = {
        vendor: payload.vendor,
        prompt: payload.prompt,
        regulation: payload.regulation,
        jurisdiction: payload.jurisdiction,
        versionIdentifier: payload.versionIdentifier,
        cmpId: payload.cmpId
      };
      registration.provenance = registrationProvenance;
      registration.updatedAt = nowIso();

      state.registrations.set(registrationId, registration);
      state.defaultRegistrationId = registrationId;
      if (registration.metadata.cmpId) {
        state.cmpIdToRegistrationId.set(registration.metadata.cmpId, registrationId);
      }

      pushAuditRecord({
        recordId: "rec_" + (++state.sequence),
        timestamp: registration.updatedAt,
        type: "audit",
        registrationId: registrationId,
        domain: registration.domain,
        source: "cmp",
        declaration: {
          action: "registerInterface",
          vendor: registration.metadata.vendor,
          versionIdentifier: registration.metadata.versionIdentifier
        }
      });

      return Promise.resolve({
        registrationId: registrationId
      });
    },

    registerVendors: function registerVendors(vendors, options) {
      assertDomContext("registerVendors");
      requireArray(vendors, "vendors");
      options = options || {};
      var registrationId = resolveRegistrationId(options.registrationId);
      var registration = getRegistrationById(registrationId);
      var source = "cmp";
      var context = {
        source: source,
        registration: registration
      };
      enforceMutationRate("registerVendors", registration, source);
      enforceArraySize(vendors, "vendors", LIMITS.MAX_CATALOG_ITEMS_PER_CALL, context);

      var normalizedVendors = vendors.map(function (vendor) {
        return normalizeCatalogItem(vendor, "vendor", context);
      });

      var incomingNewVendorCount = 0;
      normalizedVendors.forEach(function (vendor) {
        if (!registration.vendors.has(vendor.id)) {
          incomingNewVendorCount += 1;
        }
      });

      if (registration.vendors.size + incomingNewVendorCount > LIMITS.MAX_CATALOG_ITEMS_PER_REGISTRATION) {
        raiseAntiSpamError(
          "ValidationError",
          "PAYLOAD_TOO_LARGE",
          "vendors exceed per-registration catalog cap.",
          "payload_caps",
          {
            field: "vendors",
            limit: LIMITS.MAX_CATALOG_ITEMS_PER_REGISTRATION,
            current: registration.vendors.size,
            incomingNew: incomingNewVendorCount
          },
          context
        );
      }

      normalizedVendors.forEach(function (vendor) {
        registration.vendors.set(vendor.id, vendor);
      });
      registration.updatedAt = nowIso();

      pushAuditRecord({
        recordId: "rec_" + (++state.sequence),
        timestamp: registration.updatedAt,
        type: "audit",
        registrationId: registration.registrationId,
        domain: registration.domain,
        source: "cmp",
        declaration: {
          action: "registerVendors",
          vendorIds: normalizedVendors.map(function (vendor) {
            return vendor.id;
          })
        }
      });

      return Promise.resolve({
        count: normalizedVendors.length
      });
    },

    registerPurposes: function registerPurposes(purposes, options) {
      assertDomContext("registerPurposes");
      requireArray(purposes, "purposes");
      options = options || {};
      var registrationId = resolveRegistrationId(options.registrationId);
      var registration = getRegistrationById(registrationId);
      var source = "cmp";
      var context = {
        source: source,
        registration: registration
      };
      enforceMutationRate("registerPurposes", registration, source);
      enforceArraySize(purposes, "purposes", LIMITS.MAX_CATALOG_ITEMS_PER_CALL, context);

      var normalizedPurposes = purposes.map(function (purpose) {
        return normalizeCatalogItem(purpose, "purpose", context);
      });

      var incomingNewPurposeCount = 0;
      normalizedPurposes.forEach(function (purpose) {
        if (!registration.purposes.has(purpose.id)) {
          incomingNewPurposeCount += 1;
        }
      });

      if (registration.purposes.size + incomingNewPurposeCount > LIMITS.MAX_CATALOG_ITEMS_PER_REGISTRATION) {
        raiseAntiSpamError(
          "ValidationError",
          "PAYLOAD_TOO_LARGE",
          "purposes exceed per-registration catalog cap.",
          "payload_caps",
          {
            field: "purposes",
            limit: LIMITS.MAX_CATALOG_ITEMS_PER_REGISTRATION,
            current: registration.purposes.size,
            incomingNew: incomingNewPurposeCount
          },
          context
        );
      }

      normalizedPurposes.forEach(function (purpose) {
        registration.purposes.set(purpose.id, purpose);
      });
      registration.updatedAt = nowIso();

      pushAuditRecord({
        recordId: "rec_" + (++state.sequence),
        timestamp: registration.updatedAt,
        type: "audit",
        registrationId: registration.registrationId,
        domain: registration.domain,
        source: "cmp",
        declaration: {
          action: "registerPurposes",
          purposeIds: normalizedPurposes.map(function (purpose) {
            return purpose.id;
          })
        }
      });

      return Promise.resolve({
        count: normalizedPurposes.length
      });
    },

    requestConsent: function requestConsent(request) {
      assertDomContext("requestConsent");
      if (request === undefined) {
        request = {};
      }
      if (!isObject(request)) {
        throw createError("ValidationError", "INVALID_REQUEST", "requestConsent payload must be an object.");
      }
      var registrationId = resolveRegistrationId(request.registrationId);
      var registration = getRegistrationById(registrationId);
      var source = "cmp";
      var context = {
        source: source,
        registration: registration
      };
      enforceMutationRate("requestConsent", registration, source);
      validateIdentifierArray(request.vendorIds, "vendorIds", context);
      validateIdentifierArray(request.purposeIds, "purposeIds", context);
      enforceStringLength(request.reason, "request.reason", LIMITS.MAX_REASON_LENGTH, context);
      emit("consent_request", {
        vendorIds: request.vendorIds || [],
        purposeIds: request.purposeIds || [],
        reason: request.reason || undefined
      }, source, registrationId);
      return Promise.resolve(buildSnapshot(registration));
    },

    updatePreferences: function updatePreferences(update) {
      if (!isObject(update)) {
        throw createError("ValidationError", "INVALID_UPDATE", "updatePreferences payload must be an object.");
      }
      var registrationId = resolveRegistrationId(update.registrationId);
      var registration = getRegistrationById(registrationId);
      var source =
        update.source ||
        (isExtensionContext() ? "privacy_assistant" : "cmp");
      var context = {
        source: source,
        registration: registration
      };
      enforceMutationRate("updatePreferences", registration, source);
      enforceStringLength(update.reason, "update.reason", LIMITS.MAX_REASON_LENGTH, context);
      return Promise.resolve(updateRegistrationPreferences(registration, update, source, context));
    },

    withdraw: function withdraw(scope) {
      if (scope === undefined) {
        scope = {};
      }
      if (!isObject(scope)) {
        throw createError("ValidationError", "INVALID_SCOPE", "withdraw payload must be an object.");
      }
      var registrationId = resolveRegistrationId(scope.registrationId);
      var registration = getRegistrationById(registrationId);
      var source = "cmp";
      if (isExtensionContext()) {
        source = "privacy_assistant";
      } else {
        assertDomContext("withdraw");
      }
      var context = {
        source: source,
        registration: registration
      };
      enforceMutationRate("withdraw", registration, source);
      validateIdentifierArray(scope.vendorIds, "vendorIds", context);
      validateIdentifierArray(scope.purposeIds, "purposeIds", context);
      enforceStringLength(scope.reason, "scope.reason", LIMITS.MAX_REASON_LENGTH, context);
      return Promise.resolve(withdrawRegistrationScope(registration, scope, source, "withdraw"));
    },

    getVendors: function getVendors(filter) {
      assertExtensionContext("getVendors");
      filter = filter || {};
      var result = [];
      var seen = new Set();

      if (filter.registrationId) {
        var registration = getRegistrationById(filter.registrationId);
        registration.vendors.forEach(function (vendor) {
          result.push(vendor);
        });
        return Promise.resolve(result);
      }

      state.registrations.forEach(function (registration) {
        registration.vendors.forEach(function (vendor) {
          if (!seen.has(vendor.id)) {
            seen.add(vendor.id);
            result.push(vendor);
          }
        });
      });
      return Promise.resolve(result);
    },

    getPurposes: function getPurposes(filter) {
      assertExtensionContext("getPurposes");
      filter = filter || {};
      var result = [];
      var seen = new Set();

      if (filter.registrationId) {
        var registration = getRegistrationById(filter.registrationId);
        registration.purposes.forEach(function (purpose) {
          result.push(purpose);
        });
        return Promise.resolve(result);
      }

      state.registrations.forEach(function (registration) {
        registration.purposes.forEach(function (purpose) {
          if (!seen.has(purpose.id)) {
            seen.add(purpose.id);
            result.push(purpose);
          }
        });
      });
      return Promise.resolve(result);
    },

    hide: function hide(target) {
      assertExtensionContext("hide");
      if (target === undefined) {
        target = {};
      }
      if (!isObject(target)) {
        throw createError("ValidationError", "INVALID_TARGET", "hide payload must be an object.");
      }
      var registrationId = target.registrationId ? resolveRegistrationId(target.registrationId) : null;
      var registration = registrationId ? getRegistrationById(registrationId) : null;
      var source = "privacy_assistant";
      var context = {
        source: source,
        registration: registration,
        registrationId: registrationId || undefined
      };
      enforceMutationRate("hide", registration, source);
      enforceStringLength(target.reason, "target.reason", LIMITS.MAX_REASON_LENGTH, context);
      emit("hide", target, "privacy_assistant", registrationId, getCurrentDomain());
      pushAuditRecord({
        recordId: "rec_" + (++state.sequence),
        timestamp: nowIso(),
        type: "hide",
        registrationId: registrationId || undefined,
        domain: getCurrentDomain(),
        source: "privacy_assistant",
        reason: target.reason
      });
      return Promise.resolve();
    },

    show: function show(target) {
      assertExtensionContext("show");
      if (target === undefined) {
        target = {};
      }
      if (!isObject(target)) {
        throw createError("ValidationError", "INVALID_TARGET", "show payload must be an object.");
      }
      var registrationId = target.registrationId ? resolveRegistrationId(target.registrationId) : null;
      var registration = registrationId ? getRegistrationById(registrationId) : null;
      var source = "privacy_assistant";
      var context = {
        source: source,
        registration: registration,
        registrationId: registrationId || undefined
      };
      enforceMutationRate("show", registration, source);
      enforceStringLength(target.reason, "target.reason", LIMITS.MAX_REASON_LENGTH, context);
      emit("show", target, "privacy_assistant", registrationId, getCurrentDomain());
      pushAuditRecord({
        recordId: "rec_" + (++state.sequence),
        timestamp: nowIso(),
        type: "show",
        registrationId: registrationId || undefined,
        domain: getCurrentDomain(),
        source: "privacy_assistant",
        reason: target.reason
      });
      return Promise.resolve();
    },

    audit: function audit(query) {
      assertExtensionContext("audit");
      if (query === undefined) {
        query = {};
      }
      if (!isObject(query)) {
        throw createError("ValidationError", "INVALID_QUERY", "audit query must be an object.");
      }
      var effectiveLimit = LIMITS.MAX_AUDIT_QUERY_LIMIT;
      if (typeof query.limit === "number" && query.limit >= 0) {
        effectiveLimit = Math.min(query.limit, LIMITS.MAX_AUDIT_QUERY_LIMIT);
      }

      var filtered = state.audit.filter(function (record) {
        if (query.registrationId && record.registrationId !== query.registrationId) {
          return false;
        }
        if (query.from && record.timestamp < query.from) {
          return false;
        }
        if (query.to && record.timestamp > query.to) {
          return false;
        }
        return true;
      });

      filtered = filtered.slice(0, effectiveLimit);

      emit(
        "audit",
        { query: query, count: filtered.length, effectiveLimit: effectiveLimit },
        "privacy_assistant",
        query.registrationId,
        getCurrentDomain()
      );
      return Promise.resolve(filtered);
    },

    init: function init(metadata) {
      assertExtensionContext("init");
      metadata = isObject(metadata) ? metadata : {};
      var source = "privacy_assistant";
      var context = {
        source: source
      };
      enforceMutationRate("init", null, source);
      enforceStringLength(metadata.assistantId, "metadata.assistantId", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      enforceStringLength(metadata.version, "metadata.version", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      enforceStringLength(metadata.displayName, "metadata.displayName", LIMITS.MAX_TEXT_LENGTH, context);
      emit("init", metadata, "privacy_assistant", null, getCurrentDomain());
      pushAuditRecord({
        recordId: "rec_" + (++state.sequence),
        timestamp: nowIso(),
        type: "init",
        domain: getCurrentDomain(),
        source: "privacy_assistant"
      });
      return Promise.resolve();
    },

    getRegulations: function getRegulations() {
      var browserDefault = state.regulation.browserDefault;
      var override = state.regulation.override;

      if (override) {
        return Promise.resolve({
          regulations: Array.isArray(override.regulations) ? override.regulations.slice() : [],
          jurisdiction: override.jurisdiction !== undefined ? override.jurisdiction : null,
          source: "privacy_assistant",
          browserDefault: browserDefault ? {
            regulations: Array.isArray(browserDefault.regulations) ? browserDefault.regulations.slice() : [],
            jurisdiction: browserDefault.jurisdiction || null
          } : null
        });
      }

      if (browserDefault) {
        return Promise.resolve({
          regulations: Array.isArray(browserDefault.regulations) ? browserDefault.regulations.slice() : [],
          jurisdiction: browserDefault.jurisdiction || null,
          source: "browser",
          browserDefault: null
        });
      }

      return Promise.resolve({
        regulations: [],
        jurisdiction: null,
        source: "browser",
        browserDefault: null
      });
    },

    setRegulations: function setRegulations(options) {
      assertExtensionContext("setRegulations");
      if (!isObject(options)) {
        throw createError("ValidationError", "INVALID_OPTIONS", "setRegulations options must be an object.");
      }
      var source = "privacy_assistant";
      var context = { source: source };

      if (options.regulations !== undefined) {
        if (!Array.isArray(options.regulations)) {
          throw createError("ValidationError", "INVALID_REGULATIONS", "regulations must be an array of strings.");
        }
        options.regulations.forEach(function (reg) {
          if (typeof reg !== "string" || reg.length === 0) {
            throw createError("ValidationError", "INVALID_REGULATIONS", "regulations entries must be non-empty strings.");
          }
          enforceStringLength(reg, "regulations[]", LIMITS.MAX_IDENTIFIER_LENGTH, context);
        });
      }
      if (options.jurisdiction !== undefined && options.jurisdiction !== null) {
        if (typeof options.jurisdiction !== "string") {
          throw createError("ValidationError", "INVALID_JURISDICTION", "jurisdiction must be a string or null.");
        }
        enforceStringLength(options.jurisdiction, "jurisdiction", LIMITS.MAX_IDENTIFIER_LENGTH, context);
      }

      enforceMutationRate("setRegulations", null, source);

      var clearOverride =
        Array.isArray(options.regulations) && options.regulations.length === 0 && options.jurisdiction === null;

      if (clearOverride) {
        state.regulation.override = null;
      } else {
        if (!state.regulation.override) {
          state.regulation.override = { regulations: [], jurisdiction: null };
        }
        if (options.regulations !== undefined) {
          state.regulation.override.regulations = options.regulations.slice();
        }
        if (options.jurisdiction !== undefined) {
          state.regulation.override.jurisdiction = options.jurisdiction;
        }
      }

      var result = {
        regulations: [],
        jurisdiction: null,
        source: "browser",
        browserDefault: null
      };

      if (state.regulation.override) {
        result.regulations = Array.isArray(state.regulation.override.regulations) ? state.regulation.override.regulations.slice() : [];
        result.jurisdiction = state.regulation.override.jurisdiction !== undefined ? state.regulation.override.jurisdiction : null;
        result.source = "privacy_assistant";
        result.browserDefault = state.regulation.browserDefault ? {
          regulations: Array.isArray(state.regulation.browserDefault.regulations) ? state.regulation.browserDefault.regulations.slice() : [],
          jurisdiction: state.regulation.browserDefault.jurisdiction || null
        } : null;
      } else if (state.regulation.browserDefault) {
        result.regulations = Array.isArray(state.regulation.browserDefault.regulations) ? state.regulation.browserDefault.regulations.slice() : [];
        result.jurisdiction = state.regulation.browserDefault.jurisdiction || null;
        result.source = "browser";
      }

      pushAuditRecord({
        recordId: "rec_" + (++state.sequence),
        timestamp: nowIso(),
        type: "regulation_change",
        domain: getCurrentDomain(),
        source: source,
        changes: {
          regulations: result.regulations,
          jurisdiction: result.jurisdiction,
          cleared: clearOverride
        }
      });

      emit("regulation_change", result, source, null, getCurrentDomain());

      return Promise.resolve(result);
    },

    addEventListener: function addEventListener(type, listener) {
      if (EVENT_TYPES.indexOf(type) === -1) {
        throw createError("ValidationError", "INVALID_EVENT_TYPE", "Unsupported event type: " + String(type));
      }
      if (typeof listener !== "function") {
        throw createError("ValidationError", "INVALID_LISTENER", "Listener must be a function.");
      }
      state.listeners.get(type).add(listener);
    },

    removeEventListener: function removeEventListener(type, listener) {
      if (EVENT_TYPES.indexOf(type) === -1) {
        return;
      }
      state.listeners.get(type).delete(listener);
    }
  };

  Object.defineProperty(global.navigator, "consent", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: consentApi
  });
})(typeof window !== "undefined" ? window : globalThis);
