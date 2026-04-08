/**
 * AI Farm Manager — hosted connection + BYOK LLM key (robot panel).
 * Branded builds: branding.json supplies default URL + embedded FARMDASH key (user only enters LLM key).
 */
(function () {
  const LS_URL = 'farmdash_ai_manager_base_url';
  const LS_KEY = 'farmdash_ai_integration_key';

  function getBase() {
    return (localStorage.getItem(LS_URL) || '').replace(/\/$/, '');
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
      o.textContent = 'No bot profiles yet — your host creates them in /admin';
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
    var fdHint = data.farmDashboardConnectHint;
    var html = '';
    if (data.farmDashboardPushMode) {
      html += '<p class="small text-success mb-2"><strong>Data sync</strong> — this app sends farm snapshots to the AI server (outbound only).</p>';
    }
    html += '<p class="small text-muted mb-2">Server link: <code>' + (data.farmDashboardOrigin || '—') + '</code></p>';
    html += '<p><strong>Farm saves in this app:</strong> ' + (data.farmDashboardServerCount || 0) +
      ' · <strong>AI bot profiles:</strong> ' + (data.botInstanceCount || 0) + '</p>';
    if (fdErr) {
      html += '<p class="text-warning small">Note: ' + String(fdErr) + '</p>';
      if (fdHint) {
        html += '<p class="text-info small">' + String(fdHint) + '</p>';
      }
    }
    html += '<h6 class="text-farm-accent mt-3">Your servers (from this app)</h6><ul class="small">';
    for (var i = 0; i < fd.length; i++) {
      var s = fd[i];
      html += '<li><strong>' + (s.name || s.id) + '</strong> — id <code>' + (s.id || '') + '</code>' +
        (s.localSubFolder ? ' · save <code>' + s.localSubFolder + '</code>' : '') + '</li>';
    }
    html += '</ul>';
    html += '<h6 class="text-farm-accent mt-3">Bot profiles (game <code>!bot</code>)</h6><ul class="small">';
    for (var j = 0; j < bi.length; j++) {
      var b = bi[j];
      html += '<li>' + (b.label || '—') + ' → save id <code>' + (b.dashboard_server_id || '(default)') + '</code> · ' +
        (b.enabled ? 'on' : 'off') + ' · token <code>' + (b.server_token_masked || '—') + '</code></li>';
    }
    html += '</ul>';
    html += '<p class="small text-muted mb-0">Your host manages profiles. Use <strong>Write to FS25 modsSettings</strong> to install the token for <code>!bot</code>.</p>';
    container.innerHTML = html;
    populateInstanceSelect(data);
  }

  function applyBrandingUi() {
    var rowUrl = document.getElementById('aiFarmBotRowBackendUrl');
    var rowKey = document.getElementById('aiFarmBotRowIntegrationKey');
    var note = document.getElementById('aiFarmBotBrandedNote');
    var intro = document.getElementById('aiFarmBotIntro');
    try {
      var ipc = require('electron').ipcRenderer;
      ipc.invoke('get-ai-client-branding').then(function (b) {
        if (!b) return;
        if (intro && b.serviceName) {
          intro.innerHTML =
            'Connect to <strong>' +
            String(b.serviceName).replace(/</g, '') +
            '</strong>. Your <strong>LLM API key</strong> stays on this PC; use <strong>Write to FS25 modsSettings</strong> below to install the in-game token for <code>!bot</code>.';
        }
        if (b.hasEmbeddedIntegrationKey) {
          if (rowKey) rowKey.classList.add('d-none');
          if (note) note.classList.remove('d-none');
        } else {
          if (rowKey) rowKey.classList.remove('d-none');
          if (note) note.classList.add('d-none');
        }
        if (b.hasDefaultBackendUrl) {
          if (rowUrl) rowUrl.classList.add('d-none');
        } else {
          if (rowUrl) rowUrl.classList.remove('d-none');
        }
      });
    } catch (e) {
      if (rowKey) rowKey.classList.remove('d-none');
      if (rowUrl) rowUrl.classList.remove('d-none');
    }
  }

  function populateByokFromStore() {
    try {
      var ipc = require('electron').ipcRenderer;
      var clearCb = document.getElementById('aiFarmBotClearByok');
      if (clearCb) clearCb.checked = false;
      ipc.invoke('get-consultant-byok-meta').then(function (m) {
        var prov = document.getElementById('aiFarmBotByokProvider');
        var keyEl = document.getElementById('aiFarmBotByokKey');
        if (prov) prov.value = m && m.provider === 'gemini' ? 'gemini' : 'openai';
        if (keyEl) {
          keyEl.value = '';
          keyEl.placeholder = m && m.hasKey ? '•••• leave blank to keep saved key' : 'sk-… or AIza…';
        }
      });
    } catch (e2) {}
  }

  function loadPanel() {
    var container = document.getElementById('aiFarmBotPanelBody');
    if (!container) return;
    container.innerHTML = '<p class="text-muted">Loading…</p>';

    function doFetch(base, key) {
      var b = (base || '').replace(/\/$/, '') || 'http://127.0.0.1:8080';
      if (!key) {
        render(
          container,
          null,
          'Connection is not ready yet. Click <strong>Save & load</strong> below, or use a build from your host that includes the link key.'
        );
        return;
      }
      fetch(b + '/api/integration/overview', {
        headers: { 'X-FarmDash-Key': encodeURIComponent(key) },
      })
        .then(function (r) {
          if (r.status === 401) throw new Error('401 — contact your host (link key mismatch).');
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          render(container, data, null);
          // When the API returns a subscription tier / plan name, show #aiFarmBotSubscriptionTierRow and set text, e.g.:
          // var tr = document.getElementById('aiFarmBotCurrentTierText');
          // var row = document.getElementById('aiFarmBotSubscriptionTierRow');
          // if (data && data.subscriptionPlan != null && tr && row) {
          //   tr.textContent = String(data.subscriptionPlan);
          //   row.classList.remove('d-none');
          // }
        })
        .catch(function (e) {
          render(container, null, String(e.message || e));
        });
    }

    try {
      var ipc = require('electron').ipcRenderer;
      ipc
        .invoke('get-ai-manager-connection')
        .then(function (c) {
          var base = (c && c.baseUrl) || getBase() || '';
          var key = (c && c.integrationKey) || getKey() || '';
          if (c && c.baseUrl) localStorage.setItem(LS_URL, base.replace(/\/$/, ''));
          if (c && c.integrationKey) localStorage.setItem(LS_KEY, key);
          doFetch(base || 'http://127.0.0.1:8080', key);
        })
        .catch(function () {
          doFetch(getBase() || 'http://127.0.0.1:8080', getKey());
        });
    } catch (e3) {
      doFetch(getBase() || 'http://127.0.0.1:8080', getKey());
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var urlIn = document.getElementById('aiFarmBotBaseUrl');
    var keyIn = document.getElementById('aiFarmBotIntegrationKey');
    var saveBtn = document.getElementById('aiFarmBotSaveSettings');
    var refreshBtn = document.getElementById('aiFarmBotRefresh');
    var installBtn = document.getElementById('aiFarmBotInstallLocal');
    var installOut = document.getElementById('aiFarmBotInstallResult');

    if (urlIn) urlIn.value = getBase() || '';
    if (keyIn) keyIn.value = getKey();
    try {
      var ipcSync = require('electron').ipcRenderer;
      ipcSync.invoke('get-ai-manager-connection').then(function (c) {
        if (urlIn && c && c.baseUrl) urlIn.value = c.baseUrl;
        if (keyIn && c && c.integrationKey) keyIn.value = c.integrationKey;
        var pushCb = document.getElementById('aiFarmBotPushSnapshots');
        if (pushCb && c) pushCb.checked = !!c.pushSnapshots;
      });
    } catch (eSync) {}

    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var pushCb = document.getElementById('aiFarmBotPushSnapshots');
        var pushSnapshots = !!(pushCb && pushCb.checked);
        var baseVal = urlIn ? urlIn.value.trim().replace(/\/$/, '') : '';
        var keyVal = keyIn && !keyIn.closest('.d-none') ? keyIn.value.trim() : '';
        if (baseVal) localStorage.setItem(LS_URL, baseVal);
        if (keyVal) localStorage.setItem(LS_KEY, keyVal);

        try {
          var ipc0 = require('electron').ipcRenderer;
          await ipc0.invoke('save-ai-manager-connection', {
            baseUrl: baseVal,
            integrationKey: keyVal,
            pushSnapshots: pushSnapshots,
          });

          var clearByok = document.getElementById('aiFarmBotClearByok');
          var byokKeyEl = document.getElementById('aiFarmBotByokKey');
          var byokKeyRaw = byokKeyEl ? byokKeyEl.value.trim() : '';
          var byokProv =
            document.getElementById('aiFarmBotByokProvider') &&
            document.getElementById('aiFarmBotByokProvider').value === 'gemini'
              ? 'gemini'
              : 'openai';
          if (clearByok && clearByok.checked) {
            await ipc0.invoke('save-consultant-byok-credentials', { clear: true });
          } else {
            var meta = await ipc0.invoke('get-consultant-byok-meta');
            if (byokKeyRaw || (meta && meta.hasKey)) {
              await ipc0.invoke('save-consultant-byok-credentials', {
                apiKey: byokKeyRaw,
                provider: byokProv,
              });
            }
          }
        } catch (e0) {}

        loadPanel();
        populateByokFromStore();
      });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', loadPanel);

    var llmPingBtn = document.getElementById('aiFarmBotLlmPing');
    var llmPingOut = document.getElementById('aiFarmBotLlmPingResult');
    function runDashboardLlmPing() {
      if (!llmPingOut) return;
      llmPingOut.textContent = 'Checking…';
      llmPingOut.className = 'small text-info mb-3 mb-md-2';

      function mergeHeaders(byok) {
        var h = { 'X-FarmDash-Key': '' };
        if (byok && byok.apiKey) {
          h['X-AI-API-Key'] = byok.apiKey;
          if (byok.provider === 'gemini' || byok.provider === 'openai') {
            h['X-AI-Provider'] = byok.provider;
          }
        }
        return h;
      }

      function doPing(base, key, headers) {
        var b = (base || '').replace(/\/$/, '') || 'http://127.0.0.1:8080';
        if (!key) {
          llmPingOut.textContent = 'Save connection settings first (Farm Dashboard link key).';
          llmPingOut.className = 'small text-warning mb-3 mb-md-2';
          return;
        }
        headers['X-FarmDash-Key'] = encodeURIComponent(key);
        fetch(b + '/api/integration/llm-ping', { headers: headers })
          .then(function (r) {
            if (r.status === 401) throw new Error('401 — link key mismatch.');
            return r.text().then(function (txt) {
              try {
                return { status: r.status, body: JSON.parse(txt) };
              } catch (eJ) {
                throw new Error('HTTP ' + r.status + (txt ? ': ' + txt.slice(0, 120) : ''));
              }
            });
          })
          .then(function (x) {
            var j = x.body || {};
            if (j.ok) {
              var ms = j.latency_ms != null ? String(j.latency_ms) : '—';
              var prov = j.provider || '—';
              var model = j.model ? ' · ' + j.model : '';
              var det = (j.detail || '').replace(/</g, '');
              llmPingOut.textContent =
                'OK — ' + prov + model + ' · ' + ms + ' ms · ' + det;
              llmPingOut.className = 'small text-success mb-3 mb-md-2';
            } else {
              llmPingOut.textContent = (j.detail || j.message || 'LLM check failed') + '';
              llmPingOut.className = 'small text-warning mb-3 mb-md-2';
            }
          })
          .catch(function (e) {
            llmPingOut.textContent = String(e.message || e);
            llmPingOut.className = 'small text-danger mb-3 mb-md-2';
          });
      }

      try {
        var ipc = require('electron').ipcRenderer;
        Promise.all([
          ipc.invoke('get-ai-manager-connection'),
          ipc.invoke('get-consultant-byok-credentials'),
        ])
          .then(function (arr) {
            var c = arr[0];
            var byok = arr[1];
            var base = (c && c.baseUrl) || getBase() || '';
            var key = (c && c.integrationKey) || getKey() || '';
            doPing(base, key, mergeHeaders(byok || {}));
          })
          .catch(function () {
            doPing(getBase(), getKey(), {});
          });
      } catch (ePing) {
        doPing(getBase(), getKey(), {});
      }
    }
    if (llmPingBtn) llmPingBtn.addEventListener('click', runDashboardLlmPing);
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
      modal.addEventListener('shown.bs.modal', function () {
        applyBrandingUi();
        populateByokFromStore();
        loadPanel();
      });
    }
    if (installBtn && installOut) {
      installBtn.addEventListener('click', function () {
        var sel = document.getElementById('aiFarmBotInstanceSelect');
        var id = sel && sel.value;
        if (!id) {
          installOut.textContent = 'Select a bot profile.';
          return;
        }
        var ipc;
        try {
          ipc = require('electron').ipcRenderer;
        } catch (e1) {
          ipc = null;
        }
        if (!ipc) {
          installOut.textContent = 'Use the desktop app. Or download XML from your host’s admin.';
          return;
        }
        installOut.textContent = 'Writing…';
        ipc
          .invoke('get-ai-manager-connection')
          .then(function (c) {
            var base = (c && c.baseUrl) || getBase() || '';
            var key = (c && c.integrationKey) || getKey() || '';
            if (!key) {
              installOut.textContent = 'Save settings first (connection not ready).';
              return Promise.reject(new Error('__skip_install__'));
            }
            return ipc.invoke('ai-farm-install-config-xml', {
              baseUrl: base,
              integrationKey: key,
              instanceId: id,
            });
          })
          .then(function (r) {
            if (r && r.path) installOut.textContent = 'Saved: ' + r.path;
            else if (r && r.ok) installOut.textContent = 'OK';
          })
          .catch(function (e) {
            if (e && e.message === '__skip_install__') return;
            installOut.textContent = String(e.message || e);
          });
      });
    }
  });
})();
