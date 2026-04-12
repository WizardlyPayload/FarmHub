/**
 * AI Farm Manager — proactive consultant insights via Farm Dashboard proxy (GET /api/farmdash-ai/consultant/insights).
 */
(function () {
  function pl(stage, message, meta) {
    if (typeof pipelineLog === 'function') pipelineLog(stage, message, meta);
  }
  var REFRESH_MS = 300000; // 5 minutes
  var insightsIntervalId = null;
  var insightsObserver = null;
  /** Prevents overlapping GET /consultant/insights (navigation + observer + interval firing together). */
  var insightsFetchInFlight = false;

  function insightsFetchDone() {
    insightsFetchInFlight = false;
  }

  function buildConsultantInsightsQuery(viewParam) {
    var parts = [];
    var sid = '';
    try {
      sid =
        (window.dashboard && window.dashboard.activeServerId) ||
        localStorage.getItem('dashboard_active_server') ||
        '';
    } catch (e0) {
      sid = '';
    }
    if (sid) parts.push('serverId=' + encodeURIComponent(sid));
    var farmId = '';
    try {
      if (window.dashboard && window.dashboard.activeFarmId != null) {
        farmId = String(window.dashboard.activeFarmId);
      }
    } catch (eFarm) {
      farmId = '';
    }
    if (farmId) parts.push('farmId=' + encodeURIComponent(farmId));
    var vp = viewParam ? String(viewParam) : '';
    if (vp) parts.push('view=' + encodeURIComponent(vp));
    return parts.length ? parts.join('&') : '';
  }

  var INSIGHTS_CACHE_TTL_MS = 300000; // 5 min — aligned with background refresh
  var insightResultCache = {};

  function getInsightFarmId() {
    try {
      if (window.dashboard && window.dashboard.activeFarmId != null) {
        return String(window.dashboard.activeFarmId);
      }
    } catch (e) {}
    return '1';
  }

  function normalizeCacheViewKey(vp) {
    var s = String(vp || '').toLowerCase();
    if (s === 'landing' || s === 'dashboard' || s === '') return 'home';
    return s;
  }

  /** Cache key includes farm so switching farms never shows another farm’s suggestions. */
  function insightCacheStorageKey(viewKey) {
    return getInsightFarmId() + ':' + normalizeCacheViewKey(viewKey);
  }

  function insightCacheGet(viewKey) {
    var k = insightCacheStorageKey(viewKey);
    var c = insightResultCache[k];
    if (!c || !c.ts) return null;
    if (Date.now() - c.ts > INSIGHTS_CACHE_TTL_MS) return null;
    return c;
  }

  function insightCacheSet(viewKey, insights, llmUsed) {
    var k = insightCacheStorageKey(viewKey);
    insightResultCache[k] = {
      insights: insights || [],
      llm_used: !!llmUsed,
      ts: Date.now(),
    };
  }

  /** Persisted across restarts by consultant-disk-cache.js (localStorage). */
  function insightCacheGetAllForSave() {
    var out = {};
    for (var k in insightResultCache) {
      if (!insightResultCache.hasOwnProperty(k)) continue;
      var c = insightResultCache[k];
      if (!c || !c.insights) continue;
      out[k] = { insights: c.insights, llm_used: !!c.llm_used };
    }
    return out;
  }

  function insightCacheMergeFromDisk(entries) {
    if (!entries || typeof entries !== 'object') return;
    for (var k in entries) {
      if (!entries.hasOwnProperty(k)) continue;
      var e = entries[k];
      if (e && e.insights) {
        insightResultCache[k] = {
          insights: e.insights,
          llm_used: !!e.llm_used,
          ts: Date.now(),
        };
      }
    }
  }

  try {
    window.__farmdashInsightCacheGetAll = insightCacheGetAllForSave;
    window.__farmdashInsightCacheMergeFromDisk = insightCacheMergeFromDisk;
  } catch (eReg) {}

  function clearFarmDashInsightCache() {
    insightResultCache = {};
  }

  /**
   * GET consultant insights via Farm Dashboard only (localhost forwards to AI; LAN uses cache — see main.js).
   * @param {string} viewParam view= query
   * @param {{ silent?: boolean }} fetchOpts silent:true = preload / background (no upsell modal)
   */
  function fetchInsightsForView(viewParam, fetchOpts) {
    fetchOpts = fetchOpts || {};
    var proxyBase =
      typeof window !== 'undefined' && window.location && window.location.origin
        ? window.location.origin + '/api/farmdash-ai/consultant/insights'
        : '';
    if (!proxyBase) return Promise.reject(new Error('__no_origin__'));
    var q = buildConsultantInsightsQuery(viewParam);
    var apiURL = q ? proxyBase + '?' + q : proxyBase;
    return fetch(apiURL, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            if (typeof window.farmdashNotifyConsultantHttpError === 'function' && !fetchOpts.silent) {
              window.farmdashNotifyConsultantHttpError(r.status, t, { silent: true });
            }
            return Promise.reject(new Error('HTTP ' + r.status + (t ? ': ' + t.slice(0, 120) : '')));
          });
        }
        return r.json();
      })
      .then(function (data) {
        return {
          insights: (data && data.insights) || [],
          llm_used: !!(data && data.llm_used),
        };
      })
      .catch(function (e) {
        var msg = String(e && e.message ? e.message : e);
        if (!fetchOpts.silent && msg.indexOf('HTTP ') !== 0) {
          if (typeof window.farmdashNotifyConsultantHttpError === 'function') {
            window.farmdashNotifyConsultantHttpError(0, msg, { silent: true });
          }
        }
        throw e;
      });
  }

  /**
   * Parallel: section views. Sequential: home after parallel completes. Fills insightResultCache.
   */
  function preloadAllAIInsights() {
    if (window.__farmdashSkipPreloadAiInsights) {
      pl('renderer_ok', 'preloadAllAIInsights: skipped (restored from disk cache)', {});
      try {
        var cur = getSmartPanelViewParam();
        if (cur === 'fields') {
          if (typeof dashFlushDomWork === 'function') {
            dashFlushDomWork(function () {
              renderFieldsSmartPanelForFieldsTab();
            });
          } else {
            renderFieldsSmartPanelForFieldsTab();
          }
        } else {
          var ck = insightCacheGet(cur);
          if (ck && ck.insights) {
            if (typeof dashFlushDomWork === 'function') {
              dashFlushDomWork(function () {
                renderInsights(ck.insights, ck.llm_used);
              });
            } else {
              renderInsights(ck.insights, ck.llm_used);
            }
          }
        }
      } catch (eDisk) {}
      return Promise.resolve();
    }
    var parallelViews = ['fields', 'vehicles', 'pastures', 'livestock', 'productions', 'economy'];
    pl('renderer_in', 'preloadAllAIInsights: parallel', { views: parallelViews });
    return Promise.all(
      parallelViews.map(function (v) {
        return fetchInsightsForView(v, { silent: true })
          .then(function (data) {
            insightCacheSet(v, data.insights, data.llm_used);
            return v;
          })
          .catch(function (err) {
            pl('renderer_err', 'preloadAllAIInsights parallel view failed', {
              view: v,
              err: String(err && err.message ? err.message : err),
            });
            return null;
          });
      })
    )
      .then(function () {
        return fetchInsightsForView('home', { silent: true });
      })
      .then(function (data) {
        insightCacheSet('home', data.insights, data.llm_used);
        pl('renderer_ok', 'preloadAllAIInsights: home stored', {});
        try {
          var cur = getSmartPanelViewParam();
          if (cur === 'home' && document.getElementById('ai-insights-panel')) {
            renderInsights(data.insights, data.llm_used);
          }
        } catch (ePaint) {}
      })
      .catch(function (err) {
        if (err && (err.message === '__no_key__' || err.message === '__no_origin__')) return;
        pl('renderer_err', 'preloadAllAIInsights failed', { err: String(err && err.message ? err.message : err) });
      });
  }

  /** Raw dashboard section (landing, fields, vehicles, …) — for stale-fetch detection. */
  function getCurrentDashboardSection() {
    try {
      if (window.dashboard && typeof window.dashboard.getCurrentSection === 'function') {
        return String(window.dashboard.getCurrentSection() || '').toLowerCase();
      }
    } catch (e) {}
    return '';
  }

  /** Landing vs dashboard both use no ``view=`` param — treat as one bucket for stale checks. */
  function insightSectionBucket(sec) {
    var s = String(sec || '').toLowerCase();
    if (s === 'landing' || s === 'dashboard') return 'home';
    return s;
  }

  /** Current navbar section → consultant ``view=`` param (must match sectionToViewParam inside refreshFarmInsights). */
  function getSmartPanelViewParam() {
    function sectionToViewParam(section) {
      var s = String(section || 'landing').toLowerCase();
      if (s === 'landing' || s === 'dashboard') return 'home';
      var allowed = ['fields', 'vehicles', 'pastures', 'livestock', 'productions', 'economy'];
      for (var i = 0; i < allowed.length; i++) {
        if (allowed[i] === s) return s;
      }
      return '';
    }
    return sectionToViewParam(getCurrentDashboardSection());
  }

  function showInsightsSkeleton() {
    var container = document.getElementById('ai-insights-panel');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML =
      '<div class="ai-insights-thinking-placeholder">' +
      '<p class="small text-muted mb-2">' +
      '<span class="spinner-border spinner-border-sm text-secondary me-2" role="status" aria-hidden="true"></span>' +
      'Loading Smart suggestions…' +
      '</p>' +
      '<p class="small text-muted mb-3 mb-md-2 opacity-90">Your farm data on screen is unchanged.</p>' +
      '<div class="ai-insights-skeleton-pulse">' +
      '<span class="placeholder col-12 bg-secondary mb-2 rounded d-block" style="height: 3rem;"></span>' +
      '<span class="placeholder col-10 bg-secondary mb-2 rounded d-block" style="height: 0.9rem;"></span>' +
      '<span class="placeholder col-11 bg-secondary rounded d-block" style="height: 0.9rem;"></span>' +
      '</div></div>';
  }

  /**
   * AI unavailable or declined — neutral copy (no red errors; full dashboard works without AI).
   */
  function renderSmartSuggestionsUnavailableNeutral() {
    var container = document.getElementById('ai-insights-panel');
    var badge = document.getElementById('ai-insights-llm-badge');
    if (!container) return;
    container.removeAttribute('aria-busy');
    if (badge) {
      badge.textContent = '—';
      badge.className = 'badge ms-1 bg-secondary';
      badge.title =
        'Optional — Smart suggestions need an AI host or BYOK in settings. The dashboard does not require them.';
    }
    container.innerHTML =
      '<p class="small text-muted mb-2">' +
      '<i class="bi bi-lightbulb me-1"></i> <strong>Smart suggestions</strong> are optional. When connected, this panel ranks tips from your live snapshot — fields, fleet, animals, pastures, production, and economy.' +
      '</p>' +
      '<p class="small text-muted mb-0">' +
      'Nothing is wrong with your dashboard if you skip AI. Connect an AI Farm Manager host or add BYOK in settings whenever you want these tips.' +
      '</p>';
  }

  function escapeInsightHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function priorityLabelFromInsight(ins) {
    if (!ins || ins.priority == null) return 'Medium';
    var p = ins.priority;
    if (typeof p === 'object' && p !== null && 'value' in p) return String(p.value);
    return String(ins.priority);
  }

  /** Fields tab only: one card — which existing per-field AI tip to do first (no extra GET /insights). */
  function renderFieldsSmartPanelForFieldsTab() {
    var container = document.getElementById('ai-insights-panel');
    var badge = document.getElementById('ai-insights-llm-badge');
    if (!container) return;
    container.removeAttribute('aria-busy');

    var fields =
      window.dashboard && Array.isArray(window.dashboard.fields) ? window.dashboard.fields : [];
    var picked =
      typeof window.pickDoThisFirstFromFieldInsights === 'function'
        ? window.pickDoThisFirstFromFieldInsights(fields)
        : null;
    var llmUsed = !!window.__fieldConsultantLlmUsed;

    if (badge) {
      if (picked) {
        badge.textContent = llmUsed ? 'AI' : 'Rules';
        badge.className = 'badge ms-1 ' + (llmUsed ? 'bg-success' : 'bg-secondary');
        badge.title = llmUsed
          ? 'Do-this-first is picked from your per-field AI tips (same response as the field cards).'
          : 'Do-this-first is ranked from per-field tips (heuristics).';
      } else {
        badge.textContent = 'Fields';
        badge.className = 'badge ms-1 bg-info text-dark';
        badge.title =
          'Waiting for per-field AI tips. Open the Fields section or tap AI field tips on that page.';
      }
    }

    if (!picked) {
      var noFields = fields.length === 0;
      container.innerHTML = noFields
        ? '<p class="small text-muted mb-0"><i class="bi bi-hourglass-split me-1"></i> ' +
          'Waiting for field data… then tap <strong>AI field tips</strong> on the Fields page. ' +
          'This panel will show which task to do first (from the same tips as each field card).</p>'
        : '<p class="small text-muted mb-0"><i class="bi bi-info-circle me-1"></i> ' +
          'No per-field AI tips yet. On <strong>Fields</strong>, tap <strong>AI field tips</strong> — ' +
          'we&rsquo;ll rank them here as <strong>do this first</strong> (no extra server call).</p>';
      return;
    }

    var field = picked.field;
    var ins = picked.ins;
    var fname = field.name || 'Field ' + (field.farmlandId != null ? field.farmlandId : field.id);
    var priStr = priorityLabelFromInsight(ins);
    var priClass = String(priStr).toLowerCase();
    var msg = String(ins.message || '').trim();
    var excerpt = msg.length > 220 ? msg.slice(0, 217) + '…' : msg;
    var reason = String(ins.reasoning || '').trim();

    var div = document.createElement('div');
    div.className = 'insight-card priority-' + (priClass || 'medium');
    div.innerHTML =
      '<div class="insight-meta text-farm-accent">[Field] · ' +
      escapeInsightHtml(priStr) +
      ' — do this first</div>' +
      '<strong class="d-block mt-1"><i class="bi bi-flag-fill text-warning me-1"></i>' +
      escapeInsightHtml(fname) +
      ' — ' +
      escapeInsightHtml(excerpt) +
      '</strong>' +
      (reason
        ? '<p class="small text-muted mb-0 mt-1">' + escapeInsightHtml(reason) + '</p>'
        : '<p class="small text-muted mb-0 mt-1">Highest priority among the AI tips already shown on your field cards.</p>');
    container.innerHTML = '';
    container.appendChild(div);
  }

  function showFieldsSmartLoadingPlaceholder() {
    var container = document.getElementById('ai-insights-panel');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML =
      '<p class="small text-muted mb-0">' +
      '<span class="spinner-border spinner-border-sm text-secondary me-2" role="status" aria-hidden="true"></span>' +
      'Loading per-field AI tips… then we&rsquo;ll show what to do first.</p>';
  }

  function renderInsights(insights, llmUsed) {
    var container = document.getElementById('ai-insights-panel');
    var badge = document.getElementById('ai-insights-llm-badge');
    if (!container) return;
    container.removeAttribute('aria-busy');

    if (badge) {
      badge.textContent = llmUsed ? 'AI' : 'Rules';
      badge.className = 'badge ms-1 ' + (llmUsed ? 'bg-success' : 'bg-secondary');
      badge.title = llmUsed
        ? 'LLM suggestions (server API key and/or BYOK in AI Farm Manager)'
        : 'Heuristics only — configure LLM on the AI server or add BYOK in the robot panel';
    }

    container.innerHTML = '';
    var vwHome = '';
    try {
      vwHome = getSmartPanelViewParam();
    } catch (eVh) {
      vwHome = '';
    }
    if (vwHome === 'home' && insights && insights.length > 0) {
      var intro = document.createElement('p');
      intro.className = 'small text-info mb-3';
      intro.innerHTML =
        '<i class="bi bi-list-stars me-1"></i> <strong>Top 3 farm priorities</strong> — ranked from your live snapshot (fields, vehicles, animals, pastures, production, economy).';
      container.appendChild(intro);
    }
    if (!insights || insights.length === 0) {
      var vw = vwHome || '';
      if (vw === 'vehicles') {
        container.innerHTML =
          '<p class="text-success small mb-0"><i class="bi bi-check-circle me-1"></i> ' +
          "You're doing well — the fleet's looking good. No urgent fuel, damage, or maintenance flags in the snapshot. " +
          'Tap <strong>Refresh</strong> after driving or refuelling if you want another look.</p>';
      } else {
        container.innerHTML =
          '<p class="text-muted small mb-0">No ranked tips for this view right now. ' +
          'When Smart suggestions are connected, priorities from your live snapshot appear here.</p>';
      }
      return;
    }

    for (var i = 0; i < insights.length; i++) {
      var item = insights[i];
      var pri = (item.priority && String(item.priority).toLowerCase()) || 'medium';
      var div = document.createElement('div');
      div.className = 'insight-card priority-' + pri;
      var cat = item.category || '—';
      var msg = item.message || '';
      var reason = item.reasoning || '';
      var rankPrefix = '';
      try {
        if (vwHome === 'home') rankPrefix = '#' + (i + 1) + ' · ';
      } catch (eRank) {}
      div.innerHTML =
        '<div class="insight-meta text-farm-accent">' +
        rankPrefix +
        '[' +
        String(cat) +
        '] · ' +
        String(item.priority || '') +
        '</div>' +
        '<strong class="d-block mt-1">' +
        msg +
        '</strong>' +
        '<p class="small text-muted mb-0 mt-1">' +
        reason +
        '</p>';
      container.appendChild(div);
    }
  }

  function refreshFarmInsights(forceRefresh, opts) {
    if (forceRefresh === undefined) forceRefresh = false;
    opts = opts || {};
    var backgroundPoll = !!opts.background;
    var container = document.getElementById('ai-insights-panel');
    if (!container) return;

    /**
     * Fields tab: no second GET /insights — show one “do this first” card from per-field map (__fieldConsultantByRef).
     */
    if (getSmartPanelViewParam() === 'fields') {
      var doRenderFields = function () {
        renderFieldsSmartPanelForFieldsTab();
      };
      if (typeof dashFlushDomWork === 'function') {
        dashFlushDomWork(doRenderFields);
      } else {
        doRenderFields();
      }
      pl('renderer_ok', 'smart suggestions Fields tab: do-this-first from per-field map', {});
      return;
    }

    if (!forceRefresh && !opts.background) {
      var ck = insightCacheGet(getSmartPanelViewParam());
      if (ck) {
        var doCached = function () {
          renderInsights(ck.insights, ck.llm_used);
        };
        if (typeof dashFlushDomWork === 'function') {
          dashFlushDomWork(doCached);
        } else {
          doCached();
        }
        pl('renderer_ok', 'smart suggestions: served from eager-load cache', {
          view: normalizeCacheViewKey(getSmartPanelViewParam()),
        });
        return;
      }
    }

    if (!forceRefresh && insightsFetchInFlight) {
      pl('renderer_ok', 'smart suggestions: skipped (fetch already in flight)', {});
      return;
    }
    insightsFetchInFlight = true;

    if (!backgroundPoll) {
      showInsightsSkeleton();
    }

    function dbg(phase, payload) {
      try {
        if (typeof dashAiDebug === 'function') dashAiDebug('smart-suggestions', phase, payload);
      } catch (e0) {}
    }

    function runFetch() {
      /** Deferred from a prior tab: do not GET /insights on Fields (per-field map only). */
      if (getSmartPanelViewParam() === 'fields') {
        insightsFetchDone();
        container.removeAttribute('aria-busy');
        var onlyFields = function () {
          renderFieldsSmartPanelForFieldsTab();
        };
        if (typeof dashFlushDomWork === 'function') {
          dashFlushDomWork(onlyFields);
        } else {
          onlyFields();
        }
        pl('renderer_ok', 'smart suggestions: skipped network on Fields tab (deferred callback)', {});
        return;
      }

      /** If the user changes section while fetch is in flight, do not paint the old response (e.g. Home → Fields). */
      var requestedSectionAtFetch = getCurrentDashboardSection();
      var requestedViewAtFetch = getSmartPanelViewParam();

      function runSmartSuggestionsHttpFetch() {
        var proxyBase =
          typeof window !== 'undefined' && window.location && window.location.origin
            ? window.location.origin + '/api/farmdash-ai/consultant/insights'
            : '';
        if (!proxyBase) {
          var badgeP = document.getElementById('ai-insights-llm-badge');
          if (badgeP) {
            badgeP.textContent = '—';
            badgeP.className = 'badge ms-1 bg-secondary';
          }
          container.removeAttribute('aria-busy');
          container.innerHTML =
            '<p class="text-muted small mb-0">Could not resolve the dashboard URL for optional Smart suggestions. The rest of the app still works.</p>';
          return Promise.reject(new Error('__no_origin__'));
        }
        var viewParamPx = getSmartPanelViewParam();
        var qPx = buildConsultantInsightsQuery(viewParamPx);
        var apiURLpx = qPx ? proxyBase + '?' + qPx : proxyBase;
        dbg('request', {
          url: apiURLpx,
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        return fetch(apiURLpx, { method: 'GET', headers: { Accept: 'application/json' } });
      }

      runSmartSuggestionsHttpFetch()
        .then(async function (r) {
          pl('renderer_out', 'GET /api/v1/consultant/insights (Smart suggestions)', { httpStatus: r.status });
          var errText = '';
          if (!r.ok) {
            try {
              errText = await r.text();
            } catch (eTxt) {
              errText = String(eTxt);
            }
            try {
              if (typeof dashReportConsultantProblem === 'function') {
                var detErr = errText.slice(0, 500);
                try {
                  var jErr = JSON.parse(errText);
                  if (jErr && jErr.detail) detErr = String(jErr.detail);
                } catch (eJ) {}
                dashReportConsultantProblem('smart-suggestions', {
                  status: r.status,
                  detail: detErr,
                  bodySnippet: errText.slice(0, 800),
                });
              }
            } catch (eRep) {}
            dbg('error', { httpStatus: r.status, body: errText.slice(0, 4000) });
            if (typeof window.farmdashNotifyConsultantHttpError === 'function') {
              window.farmdashNotifyConsultantHttpError(r.status, errText, { silent: true });
            }
            if (r.status === 401) throw new Error('401 — wrong key or FARMDASH_INTEGRATION_KEY not set on AI server');
            if (r.status === 503) {
              var msg503 = 'Snapshot unavailable (FTP / DASHBOARD_JSON_URL)';
              try {
                var j503 = JSON.parse(errText);
                if (j503 && j503.detail) msg503 = String(j503.detail);
              } catch (eParse503) {}
              throw new Error(msg503);
            }
            throw new Error('HTTP ' + r.status + (errText ? ': ' + errText.slice(0, 200) : ''));
          }
          return r.json();
        })
        .then(function (data) {
          dbg('response', { httpStatus: 200, body: data });
          var nowSec = getCurrentDashboardSection();
          var nowView = getSmartPanelViewParam();

          if (nowSec === 'fields') {
            var doFieldsOnly = function () {
              renderFieldsSmartPanelForFieldsTab();
            };
            if (typeof dashFlushDomWork === 'function') {
              dashFlushDomWork(doFieldsOnly);
            } else {
              doFieldsOnly();
            }
            pl('renderer_ok', 'consultant/insights response ignored on Fields tab (per-field map only)', {
              llm_used: !!(data && data.llm_used),
              stale_from_section: requestedSectionAtFetch,
            });
            return;
          }

          if (
            insightSectionBucket(requestedSectionAtFetch) !== insightSectionBucket(nowSec) ||
            requestedViewAtFetch !== nowView
          ) {
            pl('renderer_ok', 'consultant/insights stale response discarded (section or view changed)', {
              requestedSection: requestedSectionAtFetch,
              nowSection: nowSec,
              requestedView: requestedViewAtFetch,
              nowView: nowView,
            });
            return;
          }

          var list = (data && data.insights) || [];
          var llm = !!(data && data.llm_used);
          var aiErr =
            data && data.farmdash_ai_error != null && String(data.farmdash_ai_error).trim() !== '';
          try {
            if (typeof dashReportConsultantProblem === 'function') {
              dashReportConsultantProblem('smart-suggestions', { status: 200, llm_used: llm, detail: '' });
            }
          } catch (eLlm) {}
          var vpStore = requestedViewAtFetch || getSmartPanelViewParam();
          if (aiErr && (!list || list.length === 0)) {
            insightCacheSet(vpStore, [], false);
            try {
              document.dispatchEvent(new CustomEvent('consultant-insights-fetched'));
            } catch (eEv) {}
            var doNeutral = function () {
              renderSmartSuggestionsUnavailableNeutral();
            };
            if (typeof dashFlushDomWork === 'function') {
              dashFlushDomWork(doNeutral);
            } else {
              doNeutral();
            }
            pl('renderer_ok', 'consultant/insights: optional AI unavailable (server flag), neutral UI', {});
            return;
          }
          insightCacheSet(vpStore, list, llm);
          try {
            document.dispatchEvent(new CustomEvent('consultant-insights-fetched'));
          } catch (eEv) {}

          var doRender = function () {
            renderInsights(list, llm);
          };
          if (typeof dashFlushDomWork === 'function') {
            dashFlushDomWork(doRender);
          } else {
            doRender();
          }
          pl('renderer_ok', 'consultant/insights parsed', { count: list.length, llm_used: llm });
          try {
            console.log('[AI Farm] Insights loaded. llm_used=' + llm + ', count=' + list.length);
          } catch (e1) {}
        })
        .catch(function (err) {
          if (err && (err.message === '__no_key__' || err.message === '__no_origin__')) {
            return;
          }
          var msg = String(err && err.message ? err.message : err);
          dbg('error', { message: msg });
          pl('renderer_err', 'GET /api/farmdash-ai/consultant/insights failed', { error: msg });
          if (msg.indexOf('HTTP ') !== 0 && typeof window.farmdashNotifyConsultantHttpError === 'function') {
            window.farmdashNotifyConsultantHttpError(0, msg, { silent: true });
          }
          var doFailNeutral = function () {
            renderSmartSuggestionsUnavailableNeutral();
          };
          if (typeof dashFlushDomWork === 'function') {
            dashFlushDomWork(doFailNeutral);
          } else {
            doFailNeutral();
          }
          try {
            if (typeof window !== 'undefined' && window.DASH_DEBUG) {
              console.warn('[AI Farm] Consultant insights unavailable:', msg);
            } else {
              console.debug('[AI Farm] Consultant insights optional path skipped:', msg.slice(0, 160));
            }
          } catch (e2) {}
        })
        .then(insightsFetchDone, insightsFetchDone);
    }

    if (typeof dashScheduleIdle === 'function') {
      dashScheduleIdle(runFetch, 900);
    } else {
      setTimeout(runFetch, 0);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.__farmdashConsultantInsightsInit) {
      return;
    }
    window.__farmdashConsultantInsightsInit = true;

    /** Called after AI Farm Manager “Test dashboard → LLM” succeeds — insights otherwise refresh every 5 min only. */
    window.refreshFarmDashConsultantInsights = refreshFarmInsights;
    window.preloadAllAIInsights = preloadAllAIInsights;
    window.clearFarmDashInsightCache = clearFarmDashInsightCache;

    document.addEventListener(
      'farmdash-first-data-ready',
      function () {
        setTimeout(function () {
          /** Hydrate AI cache from localStorage before preload (consultant-disk-cache.js may load async). */
          function runPreload() {
            preloadAllAIInsights();
          }
          if (typeof window.__farmdashHydrateConsultantDisk === 'function') {
            try {
              window.__farmdashHydrateConsultantDisk();
            } catch (eH) {}
            setTimeout(runPreload, 420);
          } else {
            import('./assests/js/consultant-disk-cache.js')
              .then(function (m) {
                try {
                  if (m.hydrateConsultantDiskCacheIfFresh) m.hydrateConsultantDiskCacheIfFresh();
                } catch (e2) {}
              })
              .catch(function () {})
              .finally(function () {
                setTimeout(runPreload, 420);
              });
          }
        }, 10);
      },
      false
    );

    var LS_INSIGHTS_COLLAPSED = 'farmdash_smart_suggestions_collapsed';

    function applySmartSuggestionsCollapsed(collapsed) {
      var card = document.getElementById('ai-farm-insights-card');
      var btn = document.getElementById('ai-insights-collapse-btn');
      var icon = document.getElementById('ai-insights-collapse-icon');
      if (!card) return;
      card.classList.toggle('farmdash-insights--collapsed', !!collapsed);
      if (btn) {
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
      if (icon) {
        icon.className = 'bi ' + (collapsed ? 'bi-chevron-down' : 'bi-chevron-up');
      }
      try {
        localStorage.setItem(LS_INSIGHTS_COLLAPSED, collapsed ? '1' : '0');
      } catch (eLs) {}
    }

    function readSmartSuggestionsCollapsed() {
      try {
        return localStorage.getItem(LS_INSIGHTS_COLLAPSED) === '1';
      } catch (e) {
        return false;
      }
    }

    applySmartSuggestionsCollapsed(readSmartSuggestionsCollapsed());

    var collapseBtn = document.getElementById('ai-insights-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function () {
        var card = document.getElementById('ai-farm-insights-card');
        var next = !(card && card.classList.contains('farmdash-insights--collapsed'));
        applySmartSuggestionsCollapsed(next);
      });
    }

    var btn = document.getElementById('ai-insights-refresh-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        refreshFarmInsights(true);
      });
    }

    if (insightsIntervalId != null) {
      clearInterval(insightsIntervalId);
    }
    insightsIntervalId = setInterval(function () {
      refreshFarmInsights(false, { background: true });
    }, REFRESH_MS);

    if (typeof dashScheduleIdle === 'function') {
      dashScheduleIdle(function () {
        refreshFarmInsights();
      }, 1500);
    } else {
      setTimeout(refreshFarmInsights, 600);
    }

    var insightRowEl = document.getElementById('ai-farm-insights-row');
    if (insightRowEl && !window.__farmdashConsultantDashObserverDone) {
      window.__farmdashConsultantDashObserverDone = true;
      var visDebounce;
      insightsObserver = new MutationObserver(function () {
        if (insightRowEl.classList.contains('d-none')) return;
        clearTimeout(visDebounce);
        visDebounce = setTimeout(function () {
          refreshFarmInsights(false);
        }, 950);
      });
      insightsObserver.observe(insightRowEl, { attributes: true, attributeFilter: ['class'] });
    }

    window.addEventListener(
      'field-consultant-updated',
      function () {
        try {
          if (getSmartPanelViewParam() !== 'fields') return;
          var fn = function () {
            renderFieldsSmartPanelForFieldsTab();
          };
          if (typeof dashFlushDomWork === 'function') {
            dashFlushDomWork(fn);
          } else {
            fn();
          }
        } catch (eFC) {}
      },
      false
    );
    window.addEventListener(
      'field-consultant-loading',
      function (ev) {
        try {
          if (getSmartPanelViewParam() !== 'fields') return;
          var on = ev.detail && ev.detail.loading;
          if (on) showFieldsSmartLoadingPlaceholder();
          else renderFieldsSmartPanelForFieldsTab();
        } catch (eL) {}
      },
      false
    );
  });
})();
