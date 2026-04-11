/**
 * AI Farm Manager — proactive consultant insights (GET /api/v1/consultant/insights).
 * Reuses the same localStorage keys as ai-farm-bot-panel.js (AI backend URL + Farm Dashboard link key).
 */
(function () {
  var LS_URL = 'farmdash_ai_manager_base_url';
  var LS_KEY = 'farmdash_ai_integration_key';

  function pl(stage, message, meta) {
    if (typeof pipelineLog === 'function') pipelineLog(stage, message, meta);
  }
  var REFRESH_MS = 300000; // 5 minutes
  var insightsIntervalId = null;
  var insightsObserver = null;

  function getBaseAsync() {
    var ls = (localStorage.getItem(LS_URL) || '').replace(/\/$/, '');
    if (ls) return Promise.resolve(ls);
    try {
      return require('electron').ipcRenderer.invoke('get-ai-manager-connection').then(function (c) {
        if (c && c.baseUrl) return String(c.baseUrl).replace(/\/$/, '');
        return 'http://127.0.0.1:8080';
      });
    } catch (e) {
      return Promise.resolve('http://127.0.0.1:8080');
    }
  }

  function getKeyAsync() {
    var ls = localStorage.getItem(LS_KEY) || '';
    if (ls) return Promise.resolve(ls);
    try {
      return require('electron').ipcRenderer.invoke('get-ai-manager-connection').then(function (c) {
        return (c && c.integrationKey) || '';
      });
    } catch (e2) {
      return Promise.resolve('');
    }
  }

  function getByokHeadersSync() {
    try {
      var ipc = require('electron').ipcRenderer;
      return ipc.invoke('get-consultant-byok-credentials').then(function (c) {
        if (!c || !c.apiKey) return {};
        var h = { 'X-AI-API-Key': c.apiKey };
        if (c.provider === 'gemini' || c.provider === 'openai') {
          h['X-AI-Provider'] = c.provider;
        }
        return h;
      });
    } catch (e) {
      return Promise.resolve({});
    }
  }

  /** Current navbar section → consultant ``view=`` param (must match sectionToViewParam inside refreshFarmInsights). */
  function getSmartPanelViewParam() {
    function sectionToViewParam(section) {
      var s = String(section || 'landing').toLowerCase();
      if (s === 'landing' || s === 'dashboard') return '';
      var allowed = ['fields', 'vehicles', 'pastures', 'livestock', 'productions', 'economy'];
      for (var i = 0; i < allowed.length; i++) {
        if (allowed[i] === s) return s;
      }
      return '';
    }
    try {
      if (window.dashboard && typeof window.dashboard.getCurrentSection === 'function') {
        return sectionToViewParam(window.dashboard.getCurrentSection());
      }
    } catch (e) {}
    return '';
  }

  function showInsightsSkeleton() {
    var container = document.getElementById('ai-insights-panel');
    if (!container) return;
    container.setAttribute('aria-busy', 'true');
    container.innerHTML =
      '<div class="ai-insights-thinking-placeholder">' +
      '<p class="small text-info mb-3">' +
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
      'AI thinking… fetching suggestions from your host.' +
      '</p>' +
      '<div class="placeholder-glow">' +
      '<span class="placeholder col-12 bg-secondary mb-2 rounded d-block" style="height: 3rem;"></span>' +
      '<span class="placeholder col-10 bg-secondary mb-2 rounded d-block" style="height: 0.9rem;"></span>' +
      '<span class="placeholder col-11 bg-secondary rounded d-block" style="height: 0.9rem;"></span>' +
      '</div></div>';
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
      '<p class="small text-info mb-0">' +
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' +
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
    if (!insights || insights.length === 0) {
      var vw = '';
      try {
        vw = getSmartPanelViewParam();
      } catch (eV) {
        vw = '';
      }
      if (vw === 'vehicles') {
        container.innerHTML =
          '<p class="text-success small mb-0"><i class="bi bi-check-circle me-1"></i> ' +
          "You're doing well — the fleet's looking good. No urgent fuel, damage, or maintenance flags in the snapshot. " +
          'Tap <strong>Refresh</strong> after driving or refuelling if you want another look.</p>';
      } else {
        container.innerHTML =
          '<p class="text-muted small mb-0">No suggestions right now — check snapshot / FTP on the AI server.</p>';
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
      div.innerHTML =
        '<div class="insight-meta text-farm-accent">[' +
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

  function refreshFarmInsights() {
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

    showInsightsSkeleton();

    function dbg(phase, payload) {
      try {
        if (typeof dashAiDebug === 'function') dashAiDebug('smart-suggestions', phase, payload);
      } catch (e0) {}
    }

    function runFetch() {
      Promise.all([getBaseAsync(), getKeyAsync()])
        .then(function (pair) {
          var base = pair[0] || 'http://127.0.0.1:8080';
          var key = pair[1] || '';
          if (!key) {
            var badge = document.getElementById('ai-insights-llm-badge');
            if (badge) {
              badge.textContent = '—';
              badge.className = 'badge ms-1 bg-secondary';
            }
            container.removeAttribute('aria-busy');
            container.innerHTML =
              '<p class="text-warning small mb-0">Open <i class="bi bi-robot"></i> <strong>AI Farm Manager</strong> and click <strong>Save &amp; load</strong>.</p>';
            return Promise.reject(new Error('__no_key__'));
          }
          var apiURL = base + '/api/v1/consultant/insights';
          var sid = '';
          try {
            sid =
              (window.dashboard && window.dashboard.activeServerId) ||
              localStorage.getItem('dashboard_active_server') ||
              '';
          } catch (e0) {
            sid = '';
          }
          if (sid) {
            apiURL += (apiURL.indexOf('?') >= 0 ? '&' : '?') + 'serverId=' + encodeURIComponent(sid);
          }
          var farmId = '';
          try {
            if (window.dashboard && window.dashboard.activeFarmId != null) {
              farmId = String(window.dashboard.activeFarmId);
            }
          } catch (eFarm) {
            farmId = '';
          }
          if (farmId) {
            apiURL += (apiURL.indexOf('?') >= 0 ? '&' : '?') + 'farmId=' + encodeURIComponent(farmId);
          }
          var viewParam = getSmartPanelViewParam();
          if (viewParam) {
            apiURL += (apiURL.indexOf('?') >= 0 ? '&' : '?') + 'view=' + encodeURIComponent(viewParam);
          }
          return getByokHeadersSync().then(function (extra) {
            var hdrs = Object.assign(
              {
                'X-FarmDash-Key': encodeURIComponent(key),
                Accept: 'application/json',
              },
              extra
            );
            dbg('request', {
              url: apiURL,
              method: 'GET',
              headers:
                typeof window !== 'undefined' && typeof window.dashRedactHeaders === 'function'
                  ? window.dashRedactHeaders(hdrs)
                  : hdrs,
            });
            return fetch(apiURL, {
              method: 'GET',
              headers: hdrs,
            });
          });
        })
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
          var list = (data && data.insights) || [];
          var llm = !!(data && data.llm_used);
          try {
            if (typeof dashReportConsultantProblem === 'function') {
              dashReportConsultantProblem('smart-suggestions', { status: 200, llm_used: llm, detail: '' });
            }
          } catch (eLlm) {}
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
          if (err && err.message === '__no_key__') return;
          dbg('error', { message: String(err && err.message ? err.message : err) });
          pl('renderer_err', 'GET /api/v1/consultant/insights failed', { error: String(err.message || err) });
          container.removeAttribute('aria-busy');
          container.innerHTML =
            '<p class="text-danger small mb-0"><i class="bi bi-exclamation-triangle me-1"></i> ' +
            String(err.message || err) +
            '</p>';
          try {
            console.error('[AI Farm] Consultant insights failed:', err);
          } catch (e2) {}
        });
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

    var btn = document.getElementById('ai-insights-refresh-btn');
    if (btn) btn.addEventListener('click', refreshFarmInsights);

    if (insightsIntervalId != null) {
      clearInterval(insightsIntervalId);
    }
    insightsIntervalId = setInterval(refreshFarmInsights, REFRESH_MS);

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
        visDebounce = setTimeout(refreshFarmInsights, 400);
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
