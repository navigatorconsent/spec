/**
 * navigator.consent TCF Adapter
 *
 * A lightweight bridge that connects any IAB TCF v2.x CMP to
 * navigator.consent. One direction only: TCF -> navigator.consent.
 *
 * Zero configuration. Zero dependencies. Auto-initializes on load.
 * If __tcfapi or navigator.consent is missing, silently exits.
 */
(function initNavigatorConsentTcfAdapter(global) {
  "use strict";

  // ── TCF v2.2 standard purpose names ──────────────────────────────

  var TCF_PURPOSES = {
    1: "Store and/or access information on a device",
    2: "Use limited data to select advertising",
    3: "Create profiles for personalised advertising",
    4: "Use profiles to select personalised advertising",
    5: "Create profiles to personalise content",
    6: "Use profiles to select personalised content",
    7: "Measure advertising performance",
    8: "Measure content performance",
    9: "Understand audiences through statistics or combinations of data from different sources",
    10: "Develop and improve services",
    11: "Use limited data to select content"
  };

  var TCF_SPECIAL_FEATURES = {
    1: "Use precise geolocation data",
    2: "Actively scan device characteristics for identification"
  };

  // ── Configuration ────────────────────────────────────────────────

  var POLL_INTERVAL_MS = 100;
  var POLL_TIMEOUT_MS = 10000;

  // ── State ────────────────────────────────────────────────────────

  var registrationId = null;
  var initialized = false;
  var gvl = null;

  // ── Helpers ──────────────────────────────────────────────────────

  function extractDomain(url) {
    if (!url) return undefined;
    try {
      return new URL(url).hostname;
    } catch (e) {
      return undefined;
    }
  }

  // ── Configured vendor detection ─────────────────────────────────

  function getConfiguredVendorIds(tcData) {
    // Axeptio SDK exposes the exact publisher-configured vendor set.
    if (global.axeptioSDK && typeof global.axeptioSDK.getConsentStatus === "function") {
      try {
        var status = global.axeptioSDK.getConsentStatus();
        if (status && (status.accepted || status.denied)) {
          var ids = {};
          (status.accepted || []).forEach(function (id) { ids[id] = true; });
          (status.denied || []).forEach(function (id) { ids[id] = true; });
          if (Object.keys(ids).length > 0) return ids;
        }
      } catch (e) {}
    }

    // Fallback for non-Axeptio CMPs. The vendor consent/LI bitfields
    // are dense (10,000+ boolean entries covering every vendor ID up to
    // maxVendorId). The CMP's configured vendors (~30-50) are the only
    // ones with `true` in either field. This misses denied vendors
    // whose LI was also objected to, but it's the best standard heuristic.
    var consents = (tcData.vendor && tcData.vendor.consents) || {};
    var lis = (tcData.vendor && tcData.vendor.legitimateInterests) || {};
    var ids = {};
    Object.keys(consents).forEach(function (k) {
      if (consents[k] === true) ids[k] = true;
    });
    Object.keys(lis).forEach(function (k) {
      if (lis[k] === true) ids[k] = true;
    });
    return ids;
  }

  // ── Build catalog arrays from TCData ─────────────────────────────

  function buildPurposes(tcData) {
    var purposes = [];
    var consents = (tcData.purpose && tcData.purpose.consents) || {};
    var lis = (tcData.purpose && tcData.purpose.legitimateInterests) || {};
    var sfOptins = tcData.specialFeatureOptins || {};

    Object.keys(TCF_PURPOSES).forEach(function (key) {
      var num = parseInt(key, 10);
      if (consents[num] !== undefined) {
        purposes.push({
          id: "tcf-purpose-" + num,
          name: TCF_PURPOSES[num],
          legalBasis: "consent",
          additionalIDs: { "iab-tcf": "purpose-" + num }
        });
      }
      if (lis[num] !== undefined) {
        purposes.push({
          id: "tcf-purpose-" + num + "-li",
          name: TCF_PURPOSES[num],
          legalBasis: "legitimate_interest",
          additionalIDs: { "iab-tcf": "purpose-" + num + "-li" }
        });
      }
    });

    Object.keys(TCF_SPECIAL_FEATURES).forEach(function (key) {
      var num = parseInt(key, 10);
      if (sfOptins[num] !== undefined) {
        purposes.push({
          id: "tcf-sf-" + num,
          name: TCF_SPECIAL_FEATURES[num],
          legalBasis: "consent",
          additionalIDs: { "iab-tcf": "sf-" + num }
        });
      }
    });

    return purposes;
  }

  function buildVendors(tcData) {
    var vendors = [];
    var configured = getConfiguredVendorIds(tcData);

    var gvlVendors = gvl && gvl.vendors;

    Object.keys(configured).forEach(function (key) {
      var num = parseInt(key, 10);
      var entry = {
        id: "tcf-vendor-" + num,
        name: "TCF Vendor #" + num,
        additionalIDs: { "iab-tcf": String(num) }
      };

      var gvlVendor = gvlVendors && gvlVendors[num];
      if (gvlVendor) {
        if (gvlVendor.name) entry.name = gvlVendor.name;
        if (gvlVendor.policyUrl) {
          entry.privacyPolicyUrl = gvlVendor.policyUrl;
          var domain = extractDomain(gvlVendor.policyUrl);
          if (domain) entry.domain = domain;
        }
        var purposeIds = [];
        if (gvlVendor.purposes) {
          gvlVendor.purposes.forEach(function (pId) {
            purposeIds.push("tcf-purpose-" + pId);
          });
        }
        if (gvlVendor.legIntPurposes) {
          gvlVendor.legIntPurposes.forEach(function (pId) {
            purposeIds.push("tcf-purpose-" + pId + "-li");
          });
        }
        if (gvlVendor.specialFeatures) {
          gvlVendor.specialFeatures.forEach(function (sfId) {
            purposeIds.push("tcf-sf-" + sfId);
          });
        }
        if (purposeIds.length > 0) entry.purposeIds = purposeIds;
      }

      vendors.push(entry);
    });

    return vendors;
  }

  // ── Build consent decisions from TCData ──────────────────────────

  function buildDecisions(tcData) {
    var purposes = {};
    var vendors = {};

    var pConsents = (tcData.purpose && tcData.purpose.consents) || {};
    Object.keys(pConsents).forEach(function (key) {
      var num = parseInt(key, 10);
      purposes["tcf-purpose-" + num] = pConsents[num] ? "grant" : "deny";
    });

    var pLIs = (tcData.purpose && tcData.purpose.legitimateInterests) || {};
    Object.keys(pLIs).forEach(function (key) {
      var num = parseInt(key, 10);
      purposes["tcf-purpose-" + num + "-li"] = pLIs[num] ? "grant" : "deny";
    });

    var sfOptins = tcData.specialFeatureOptins || {};
    Object.keys(sfOptins).forEach(function (key) {
      var num = parseInt(key, 10);
      purposes["tcf-sf-" + num] = sfOptins[num] ? "grant" : "deny";
    });

    var vConsents = (tcData.vendor && tcData.vendor.consents) || {};
    var vLIs = (tcData.vendor && tcData.vendor.legitimateInterests) || {};
    var configured = getConfiguredVendorIds(tcData);
    Object.keys(configured).forEach(function (key) {
      var num = parseInt(key, 10);
      vendors["tcf-vendor-" + num] = (vConsents[num] || vLIs[num]) ? "grant" : "deny";
    });

    return { purposes: purposes, vendors: vendors };
  }

  // ── GVL fetch (best-effort) ──────────────────────────────────────

  function fetchGvl(callback) {
    try {
      global.__tcfapi("getVendorList", 2, function (data, success) {
        if (success && data) gvl = data;
        callback();
      });
    } catch (e) {
      callback();
    }
  }

  // ── Sync preferences to navigator.consent ───────────────────────

  var DECISION_BATCH_SIZE = 1000;

  function syncPreferences(tcData) {
    var decisions = buildDecisions(tcData);
    var consent = global.navigator.consent;
    var reason = "TCF adapter sync (" + tcData.eventStatus + ")";

    // Purpose decisions are always small (≤24), send in one call
    var chain = consent.updatePreferences({
      registrationId: registrationId,
      source: "cmp",
      purposes: decisions.purposes,
      reason: reason
    });

    // Vendor decisions may exceed the per-call limit; chunk them
    var vendorKeys = Object.keys(decisions.vendors);
    for (var i = 0; i < vendorKeys.length; i += DECISION_BATCH_SIZE) {
      (function (batch) {
        var vendorBatch = {};
        batch.forEach(function (k) { vendorBatch[k] = decisions.vendors[k]; });
        chain = chain.then(function () {
          return consent.updatePreferences({
            registrationId: registrationId,
            source: "cmp",
            vendors: vendorBatch,
            reason: reason
          });
        });
      })(vendorKeys.slice(i, i + DECISION_BATCH_SIZE));
    }

    chain.catch(function () {});
    return chain;
  }

  // ── First meaningful event: full registration ────────────────────

  function handleFirstEvent(tcData) {
    var consent = global.navigator.consent;
    var cmpId = tcData.cmpId ? String(tcData.cmpId) : "unknown";
    var hasExistingConsent = tcData.eventStatus === "tcloaded";

    fetchGvl(function () {
      consent.registerInterface({
        vendor: "TCF CMP #" + cmpId,
        prompt: "This site uses cookies and similar technologies",
        regulation: "gdpr",
        jurisdiction: "eu",
        cmp: {
          id: "tcf-" + cmpId,
          version: "tcf-v" + (tcData.cmpVersion || "2"),
          frameworks: ["tcf-v2.2"]
        }
      }).then(function (result) {
        registrationId = result.registrationId;

        var purposes = buildPurposes(tcData);
        var vendors = buildVendors(tcData);
        var chain = Promise.resolve();
        var BATCH_SIZE = 250;

        if (purposes.length > 0) {
          chain = chain.then(function () {
            return consent.registerPurposes(purposes, { registrationId: registrationId });
          });
        }

        // Chunk vendors into batches to respect per-call size limits
        for (var i = 0; i < vendors.length; i += BATCH_SIZE) {
          (function (batch) {
            chain = chain.then(function () {
              return consent.registerVendors(batch, { registrationId: registrationId });
            });
          })(vendors.slice(i, i + BATCH_SIZE));
        }

        chain.then(function () {
          syncPreferences(tcData);
          // Only request consent if the CMP is showing its UI.
          // When tcloaded fires, the user already has stored consent.
          if (!hasExistingConsent) {
            return consent.requestConsent({
              registrationId: registrationId,
              purposeIds: purposes.map(function (p) { return p.id; }),
              reason: "TCF consent flow"
            });
          }
        }).catch(function () {});
      }).catch(function () {});
    });
  }

  // ── TCF event handler ───────────────────────────────────────────

  function onTcfEvent(tcData, success) {
    if (!success || !tcData) return;
    var status = tcData.eventStatus;
    if (status !== "tcloaded" && status !== "cmpuishown" && status !== "useractioncomplete") return;

    if (!initialized) {
      initialized = true;
      handleFirstEvent(tcData);
    } else if (status === "useractioncomplete") {
      syncPreferences(tcData);
    }
  }

  // ── Poll for __tcfapi + navigator.consent ───────────────────────

  var elapsed = 0;
  var timer = setInterval(function () {
    elapsed += POLL_INTERVAL_MS;
    if (elapsed > POLL_TIMEOUT_MS) {
      clearInterval(timer);
      return;
    }
    if (typeof global.__tcfapi === "function" && global.navigator && global.navigator.consent) {
      clearInterval(timer);
      global.__tcfapi("addEventListener", 2, onTcfEvent);
    }
  }, POLL_INTERVAL_MS);

})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
