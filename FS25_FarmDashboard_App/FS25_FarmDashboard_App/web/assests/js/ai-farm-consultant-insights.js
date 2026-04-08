/**
 * AI Farm Manager — proactive consultant insights (GET /api/v1/consultant/insights).
 * Reuses the same localStorage keys as ai-farm-bot-panel.js (AI backend URL + Farm Dashboard link key).
 */
(function () {
  var LS_URL = 'farmdash_ai_manager_base_url';
  var LS_KEY = 'farmdash_ai_integration_key';
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

  function renderInsights(insights, llmUsed) {
    var container = document.getElementById('ai-insights-panel');
    var badge = document.getElementById('ai-insights-llm-badge');
    if (!container) return;

    if (badge) {
      badge.textContent = llmUsed ? 'AI' : 'Rules';
      badge.className = 'badge ms-1 ' + (llmUsed ? 'bg-success' : 'bg-secondary');
      badge.title = llmUsed
        ? 'LLM via your API key'
        : 'Heuristics only — add your OpenAI/Gemini key in the robot panel (AI Farm Manager)';
    }

    container.innerHTML = '';
    if (!insights || insights.length === 0) {
      container.innerHTML = '<p class="text-muted small mb-0">No suggestions right now — check snapshot / FTP on the AI server.</p>';
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

    container.innerHTML = '<p class="text-muted small mb-0"><i class="bi bi-hourglass-split me-1"></i> Loading insights…</p>';

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
          container.innerHTML =
            '<p class="text-warning small mb-0">Open <i class="bi bi-robot"></i> <strong>AI Farm Manager</strong> and click <strong>Save &amp; load</strong>.</p>';
          return Promise.reject(new Error('__no_key__'));
        }
        var apiURL = base + '/api/v1/consultant/insights';
        return getByokHeadersSync().then(function (extra) {
          return fetch(apiURL, {
            method: 'GET',
            headers: Object.assign(
              {
                'X-FarmDash-Key': encodeURIComponent(key),
                Accept: 'application/json',
              },
              extra
            ),
          });
        });
      })
      .then(function (r) {
        if (r.status === 401) throw new Error('401 — wrong key or FARMDASH_INTEGRATION_KEY not set on AI server');
        if (r.status === 503) return r.json().then(function (j) { throw new Error(j.detail || 'Snapshot unavailable (FTP / DASHBOARD_JSON_URL)'); });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var list = (data && data.insights) || [];
        var llm = !!(data && data.llm_used);
        renderInsights(list, llm);
        try {
          console.log('[AI Farm] Insights loaded. llm_used=' + llm + ', count=' + list.length);
        } catch (e1) {}
      })
      .catch(function (err) {
        if (err && err.message === '__no_key__') return;
        container.innerHTML =
          '<p class="text-danger small mb-0"><i class="bi bi-exclamation-triangle me-1"></i> ' +
          String(err.message || err) +
          '</p>';
        try {
          console.error('[AI Farm] Consultant insights failed:', err);
        } catch (e2) {}
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.__farmdashConsultantInsightsInit) {
      return;
    }
    window.__farmdashConsultantInsightsInit = true;

    var btn = document.getElementById('ai-insights-refresh-btn');
    if (btn) btn.addEventListener('click', refreshFarmInsights);

    if (insightsIntervalId != null) {
      clearInterval(insightsIntervalId);
    }
    insightsIntervalId = setInterval(refreshFarmInsights, REFRESH_MS);

    var dashEl = document.getElementById('dashboard-content');
    if (dashEl && !window.__farmdashConsultantDashObserverDone) {
      window.__farmdashConsultantDashObserverDone = true;
      var visDebounce;
      insightsObserver = new MutationObserver(function () {
        if (dashEl.classList.contains('d-none')) return;
        clearTimeout(visDebounce);
        visDebounce = setTimeout(refreshFarmInsights, 400);
      });
      insightsObserver.observe(dashEl, { attributes: true, attributeFilter: ['class'] });
    }
  });
})();
