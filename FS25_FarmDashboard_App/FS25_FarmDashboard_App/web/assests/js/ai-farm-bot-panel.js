/**
 * AI Farm Manager — in-dashboard panel (calls AI backend /api/integration/overview).
 * Configure AI backend URL + Farm Dashboard link key (same value as FARMDASH_INTEGRATION_KEY in backend/.env).
 */
(function () {
  const LS_URL = 'farmdash_ai_manager_base_url';
  const LS_KEY = 'farmdash_ai_integration_key';

  function getBase() {
    return (localStorage.getItem(LS_URL) || 'http://127.0.0.1:8080').replace(/\/$/, '');
  }
  function getKey() {
    return localStorage.getItem(LS_KEY) || '';
  }

  function populateInstanceSelect(data) {
    var sel = document.getElementById('aiFarmBotInstanceSelect');
    if (!sel) return;
    sel.innerHTML = '';
    var bi = (data && data.botInstances) || [];
    if (bi.length === 0) {
      var o = document.createElement('option');
      o.value = '';
      o.textContent = 'No bot profiles — create them in AI /admin first';
      sel.appendChild(o);
      return;
    }
    for (var i = 0; i < bi.length; i++) {
      var b = bi[i];
      var opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = (b.label || b.id) + '  ·  ' + (b.server_token_masked || '');
      sel.appendChild(opt);
    }
  }

  function render(container, data, err) {
    if (err) {
      container.innerHTML = '<p class="text-warning">' + err + '</p>';
      populateInstanceSelect(null);
      return;
    }
    if (!data) {
      container.innerHTML = '<p class="text-muted">No data.</p>';
      populateInstanceSelect(null);
      return;
    }
    var fd = data.farmDashboardServers || [];
    var bi = data.botInstances || [];
    var fdErr = data.farmDashboardError;
    var html = '';
    html += '<p class="small text-muted mb-2">AI backend: <code>' + (data.farmDashboardOrigin || '—') + '</code> (Farm Dashboard JSON base)</p>';
    html += '<p><strong>Farm Dashboard servers:</strong> ' + (data.farmDashboardServerCount || 0) +
      ' · <strong>AI bot profiles:</strong> ' + (data.botInstanceCount || 0) + '</p>';
    if (fdErr) {
      html += '<p class="text-warning small">Farm Dashboard API note: ' + String(fdErr) + '</p>';
    }
    html += '<h6 class="text-farm-accent mt-3">Configured servers (save folders)</h6><ul class="small">';
    for (var i = 0; i < fd.length; i++) {
      var s = fd[i];
      html += '<li><strong>' + (s.name || s.id) + '</strong> — id <code>' + (s.id || '') + '</code>' +
        (s.localSubFolder ? ' · save <code>' + s.localSubFolder + '</code>' : '') + '</li>';
    }
    html += '</ul>';
    html += '<h6 class="text-farm-accent mt-3">Bot profiles (masked tokens)</h6><ul class="small">';
    for (var j = 0; j < bi.length; j++) {
      var b = bi[j];
      html += '<li>' + (b.label || '—') + ' → Farm Dash id <code>' + (b.dashboard_server_id || '(default)') + '</code> · ' +
        (b.enabled ? 'on' : 'off') + ' · token <code>' + (b.server_token_masked || '—') + '</code></li>';
    }
    html += '</ul>';
    html += '<p class="small text-muted mb-0">Manage profiles in AI Farm Manager <code>/admin</code>. Download XML or use <strong>Write to FS25 modsSettings</strong> below.</p>';
    container.innerHTML = html;
    populateInstanceSelect(data);
  }

  function loadPanel() {
    var container = document.getElementById('aiFarmBotPanelBody');
    if (!container) return;
    var base = getBase();
    var key = getKey();
    if (!key) {
      render(container, null, 'Set the Farm Dashboard link key (same value as FARMDASH_INTEGRATION_KEY in AI_Farm_Manager/backend/.env), then Save & load.');
      return;
    }
    container.innerHTML = '<p class="text-muted">Loading…</p>';
    // Header values must be ISO-8859-1 for fetch(); encodeURIComponent allows any Unicode in the secret.
    fetch(base + '/api/integration/overview', {
      headers: { 'X-FarmDash-Key': encodeURIComponent(key) },
    })
      .then(function (r) {
        if (r.status === 401) throw new Error('401 — wrong key or FARMDASH_INTEGRATION_KEY not set on AI server');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) { render(container, data, null); })
      .catch(function (e) { render(container, null, String(e.message || e)); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var urlIn = document.getElementById('aiFarmBotBaseUrl');
    var keyIn = document.getElementById('aiFarmBotIntegrationKey');
    var saveBtn = document.getElementById('aiFarmBotSaveSettings');
    var refreshBtn = document.getElementById('aiFarmBotRefresh');
    var installBtn = document.getElementById('aiFarmBotInstallLocal');
    var installOut = document.getElementById('aiFarmBotInstallResult');
    if (urlIn) urlIn.value = getBase();
    if (keyIn) keyIn.value = getKey();
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        if (urlIn) localStorage.setItem(LS_URL, (urlIn.value || '').trim() || 'http://127.0.0.1:8080');
        if (keyIn) localStorage.setItem(LS_KEY, (keyIn.value || '').trim());
        loadPanel();
      });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', loadPanel);
    var toggleKeyBtn = document.getElementById('aiFarmBotToggleKey');
    var toggleKeyIcon = document.getElementById('aiFarmBotToggleKeyIcon');
    if (toggleKeyBtn && keyIn) {
      toggleKeyBtn.addEventListener('click', function () {
        var show = keyIn.type === 'password';
        keyIn.type = show ? 'text' : 'password';
        toggleKeyBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
        toggleKeyBtn.title = show ? 'Hide key' : 'Show key';
        if (toggleKeyIcon) {
          toggleKeyIcon.className = 'bi ' + (show ? 'bi-eye-slash' : 'bi-eye');
        }
      });
    }
    var modal = document.getElementById('aiFarmBotModal');
    if (modal) {
      modal.addEventListener('shown.bs.modal', loadPanel);
    }
    if (installBtn && installOut) {
      installBtn.addEventListener('click', function () {
        var sel = document.getElementById('aiFarmBotInstanceSelect');
        var id = sel && sel.value;
        var key = getKey();
        var base = getBase();
        if (!id) {
          installOut.textContent = 'Select a bot profile.';
          return;
        }
        if (!key) {
          installOut.textContent = 'Set Farm Dashboard link key first (same as FARMDASH_INTEGRATION_KEY in backend/.env).';
          return;
        }
        var ipc;
        try {
          ipc = typeof require !== 'undefined' && require('electron') && require('electron').ipcRenderer;
        } catch (e1) {
          ipc = null;
        }
        if (!ipc) {
          installOut.textContent = 'Automatic install only works in the Farm Dashboard desktop app (not a browser). Use Download XML in AI /admin instead.';
          return;
        }
        installOut.textContent = 'Writing…';
        ipc.invoke('ai-farm-install-config-xml', { baseUrl: base, integrationKey: key, instanceId: id })
          .then(function (r) {
            installOut.textContent = 'Saved: ' + (r && r.path ? r.path : 'ok');
          })
          .catch(function (e) {
            installOut.textContent = String(e.message || e);
          });
      });
    }
  });
})();
