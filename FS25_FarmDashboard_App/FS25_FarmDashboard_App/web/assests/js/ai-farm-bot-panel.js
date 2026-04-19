/**
 * AI Farm Manager — hosted connection + BYOK LLM key (robot panel).
 * Branded builds: branding.json supplies default URL + embedded FARMDASH key (user only enters LLM key).
 */
(function () {
  const LS_URL = 'farmdash_ai_manager_base_url';
  const LS_KEY = 'farmdash_ai_integration_key';

  function pl(stage, message, meta) {
    if (typeof pipelineLog === 'function') pipelineLog(stage, message, meta);
  }

  /** Preload IPC bridge (context isolation — no require('electron') in page). */
  function fdApi() {
    return typeof window !== 'undefined' && window.farmDashAPI ? window.farmDashAPI : null;
  }

  function getBase() {
    return (localStorage.getItem(LS_URL) || '').replace(/\/$/, '');
  }
  function getKey() {
    return localStorage.getItem(LS_KEY) || '';
  }

  /** Same as main process normalizeAiFarmManagerHostedBaseUrl — API is at /api/... on origin only. */
  function normalizeHostedAiBaseUrl(b) {
    var s = String(b || '').trim().replace(/\/$/, '');
    if (!s) return '';
    try {
      var href = /^https?:\/\//i.test(s) ? s : 'http://' + s;
      var u = new URL(href);
      return u.origin;
    } catch (e) {
      return s;
    }
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

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function setConnectionBanner(data, fd, fdErr, _fdHint, loadError) {
    var el = document.getElementById('aiFarmBotConnectionBanner');
    if (!el) return;
    el.classList.remove('d-none', 'alert-success', 'alert-warning', 'alert-danger', 'alert-info', 'alert-secondary');
    if (loadError) {
      el.classList.add('alert-danger');
      el.innerHTML =
        '<strong>Could not reach AI server.</strong> ' + esc(loadError) + ' Check URL, link key, and network.';
      return;
    }
    if (!data) {
      el.classList.add('alert-secondary');
      el.innerHTML = '<strong>Status unknown.</strong> Click <strong>Refresh</strong> after <strong>Save &amp; load</strong>.';
      return;
    }
    var push = data.farmDashboardPushMode;
    var n = fd && fd.length ? fd.length : 0;
    if (push) {
      if (n > 0) {
        el.classList.add('alert-success');
        el.innerHTML =
          '<i class="bi bi-check-circle me-1"></i><strong>Farm data OK.</strong> This app is sending your save list &amp; snapshot — Smart suggestions can load.';
      } else if (data.farmDashboardConnectHint) {
        el.classList.add('alert-warning');
        el.innerHTML =
          '<i class="bi bi-exclamation-triangle me-1"></i><strong>Not sending yet.</strong> Keep <strong>Send farm data</strong> on, click <strong>Save &amp; load</strong>. Your host must turn <strong>Push mode</strong> on in AI Farm Manager admin (<strong>Farm Dashboard &amp; data</strong>) or set <code>DASHBOARD_PUSH_MODE=1</code> on the server.';
      } else {
        el.classList.add('alert-warning');
        el.innerHTML =
          '<i class="bi bi-hourglass-split me-1"></i><strong>Waiting</strong> for the first snapshot from this app.';
      }
    } else if (fdErr) {
      el.classList.add('alert-warning');
      el.innerHTML =
        '<i class="bi bi-link-45deg me-1"></i><strong>Farm data not configured on the AI server.</strong> Ask your host to turn <strong>Push mode</strong> on in admin (<strong>Farm Dashboard &amp; data</strong>) or set a dashboard URL there. <span class="d-block small mt-1">' +
        esc(fdErr) +
        '</span>';
    } else {
      el.classList.add('alert-success');
      el.innerHTML =
        '<i class="bi bi-check-circle me-1"></i><strong>Linked.</strong> AI server sees your dashboard (' +
        n +
        ' save(s)).';
    }
  }

  function wireBotEnableToggles(container, base, key) {
    var b = (base || '').replace(/\/$/, '') || 'http://127.0.0.1:8080';
    var list = container.querySelector('#aiFarmBotProfileToggles');
    if (!list || list._aiFarmBotWired) return;
    list._aiFarmBotWired = true;
    list.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t || !t.classList || !t.classList.contains('ai-farm-bot-enable-cb')) return;
      var id = t.getAttribute('data-inst-id');
      if (!id || !key) return;
      var want = !!t.checked;
      fetch(b + '/api/integration/instances/' + encodeURIComponent(id) + '/enabled', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-FarmDash-Key': encodeURIComponent(key),
        },
        body: JSON.stringify({ enabled: want }),
      })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (tx) { throw new Error(tx || 'HTTP ' + r.status); });
          return r.json();
        })
        .then(function () {
          pl('renderer_ok', want ? 'In-game chat enabled for profile' : 'In-game chat disabled for profile', {
            instId: id,
          });
        })
        .catch(function (e) {
          t.checked = !want;
          alert('Could not update: ' + (e.message || e));
        });
    });
  }

  function render(container, data, err, base, key) {
    if (err) {
      container.innerHTML = '<p class="text-warning">' + esc(err) + '</p>';
      populateInstanceSelect(null);
      setConnectionBanner(null, [], null, null, err);
      return;
    }
    if (!data) {
      container.innerHTML = '<p class="text-muted">No data.</p>';
      populateInstanceSelect(null);
      setConnectionBanner(null, [], null, null, null);
      return;
    }
    var fd = data.farmDashboardServers || [];
    var bi = data.botInstances || [];
    var fdErr = data.farmDashboardError;
    var fdHint = data.farmDashboardConnectHint;
    setConnectionBanner(data, fd, fdErr, null, null);
    var html = '';
    if (data.farmDashboardPushMode) {
      html += '<p class="small text-success mb-2"><strong>Data sync mode</strong> — snapshots go out to your host’s AI server only.</p>';
    }
    html += '<p class="small text-muted mb-2">Technical: server link <code>' + esc(data.farmDashboardOrigin || '—') + '</code></p>';
    html += '<p><strong>Farm saves listed:</strong> ' + (data.farmDashboardServerCount || 0) +
      ' · <strong>Bot profiles on server:</strong> ' + (data.botInstanceCount || 0) + '</p>';
    if (fdHint && data.farmDashboardPushMode && fd.length === 0) {
      html += '<p class="small text-info mb-2">' + esc(fdHint) + '</p>';
    }
    html += '<h6 class="text-farm-accent mt-3">Your servers (this app)</h6><ul class="small">';
    for (var i = 0; i < fd.length; i++) {
      var s = fd[i];
      html += '<li><strong>' + (s.name || s.id) + '</strong> — id <code>' + (s.id || '') + '</code>' +
        (s.localSubFolder ? ' · save <code>' + s.localSubFolder + '</code>' : '') + '</li>';
    }
    html += '</ul>';
    html += '<h6 class="text-farm-accent mt-3">In-game chat — <strong>Hank</strong> (<code>!hank</code>) per profile</h6>';
    html +=
      '<p class="small text-muted mb-2">Each profile matches one Farm Dashboard save (set by your host in <code>/admin</code>). Uncheck saves you are not using with the mod so <code>!hank</code> only runs where you want.</p>';
    html += '<ul class="small list-unstyled mb-2" id="aiFarmBotProfileToggles">';
    if (bi.length === 0) {
      html += '<li class="text-muted">No bot profiles yet — your host creates them in /admin.</li>';
    }
    for (var j = 0; j < bi.length; j++) {
      var bp = bi[j];
      var bid = bp.id || '';
      var chk = bp.enabled !== false ? ' checked' : '';
      html +=
        '<li class="mb-2"><label class="d-flex align-items-start gap-2 mb-0">' +
        '<input type="checkbox" class="form-check-input ai-farm-bot-enable-cb mt-1" data-inst-id="' +
        esc(bid) +
        '"' +
        chk +
        ' />' +
        '<span><strong>' +
        esc(bp.label || '—') +
        '</strong> — save <code>' +
        esc(bp.dashboard_server_id || '(match in /admin)') +
        '</code> · token <code>' +
        esc(bp.server_token_masked || '—') +
        '</code></span></label></li>';
    }
    html += '</ul>';
    html +=
      '<p class="small text-muted mb-0">For the in-game token, use <strong>In-game chat (!hank)</strong> below → <strong>Write to FS25 modSettings</strong> (hosted bot profiles only).</p>';
    container.innerHTML = html;
    populateInstanceSelect(data);
    wireBotEnableToggles(container, base, key);
  }

  function applyBrandingUi() {
    var rowUrl = document.getElementById('aiFarmBotRowBackendUrl');
    var rowKey = document.getElementById('aiFarmBotRowIntegrationKey');
    var note = document.getElementById('aiFarmBotBrandedNote');
    var introLead = document.getElementById('aiFarmBotIntroLead');
    var a = fdApi();
    if (!a) {
      if (rowKey) rowKey.classList.remove('d-none');
      if (rowUrl) rowUrl.classList.remove('d-none');
      return;
    }
    a.getAiClientBranding().then(function (b) {
      if (!b) return;
      if (introLead && b.serviceName) {
        introLead.innerHTML =
          '<strong>' +
          String(b.serviceName).replace(/</g, '') +
          '</strong> — use the <strong>Hosted AI</strong> sub-tab for URL + link key + Send farm data. <strong>BYOK</strong> is on the other sub-tab. In-game <code>!hank</code>: <strong>In-game chat</strong> section + <strong>Write to FS25 modSettings</strong>.';
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
  }

  function fillModelSelect(selectId, models, selectedId, emptyPhrase) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent =
      models && models.length
        ? '— choose a model —'
        : emptyPhrase || '— paste key, then Refresh models —';
    sel.appendChild(placeholder);
    var list = models || [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var id = (row && row.id) || '';
      if (!id) continue;
      var o = document.createElement('option');
      o.value = id;
      var dn = (row && row.displayName) || '';
      o.textContent = dn && dn !== id ? id + ' — ' + dn : id;
      sel.appendChild(o);
    }
    if (selectedId) {
      sel.value = selectedId;
      if (sel.value !== selectedId) {
        var o2 = document.createElement('option');
        o2.value = selectedId;
        o2.textContent = selectedId + ' (saved)';
        sel.appendChild(o2);
        sel.value = selectedId;
      }
    }
  }

  function fillByokModelSelect(models, selectedId) {
    fillModelSelect('aiFarmBotByokModelSelect', models, selectedId);
  }

  function fillOllamaModelSelect(models, selectedId) {
    fillModelSelect(
      'ollamaFmModelSelect',
      models,
      selectedId,
      '— set connection, then Refresh models —'
    );
  }

  function getOllamaPortNumber() {
    var locEl = document.getElementById('ollamaFmLocation');
    var v = locEl ? locEl.value : 'this_pc';
    var el =
      v === 'this_pc'
        ? document.getElementById('ollamaFmPortLocal')
        : document.getElementById('ollamaFmPortNetwork');
    var p = el && el.value !== '' ? parseInt(String(el.value), 10) : 11434;
    if (!Number.isFinite(p) || p < 1 || p > 65535) p = 11434;
    return p;
  }

  function buildOllamaEffectiveBaseUrl() {
    var locEl = document.getElementById('ollamaFmLocation');
    var v = locEl ? locEl.value : 'this_pc';
    if (v === 'custom') {
      var cu = document.getElementById('ollamaFmCustomUrl');
      return cu ? String(cu.value || '').trim() : '';
    }
    var port = getOllamaPortNumber();
    if (v === 'this_pc') {
      return 'http://127.0.0.1:' + port;
    }
    var hEl = document.getElementById('ollamaFmNetworkHost');
    var host = hEl ? String(hEl.value || '').trim() : '';
    if (!host) return '';
    host = host.replace(/^https?:\/\//i, '').split('/')[0];
    return 'http://' + host + ':' + port;
  }

  function syncOllamaFormVisibility() {
    var locEl = document.getElementById('ollamaFmLocation');
    var v = locEl ? locEl.value : 'this_pc';
    var rowPc = document.getElementById('ollamaFmRowThisPc');
    var rowNet = document.getElementById('ollamaFmRowNetwork');
    var rowCust = document.getElementById('ollamaFmRowCustom');
    if (rowPc) rowPc.classList.toggle('d-none', v !== 'this_pc');
    if (rowNet) rowNet.classList.toggle('d-none', v !== 'network');
    if (rowCust) rowCust.classList.toggle('d-none', v !== 'custom');
    updateOllamaPreview();
  }

  function updateOllamaPreview() {
    var p = document.getElementById('ollamaFmPreview');
    if (!p) return;
    var u = buildOllamaEffectiveBaseUrl();
    p.textContent = u
      ? 'Effective URL: ' + u + '  (API uses …/v1/chat/completions)'
      : '— choose connection or enter custom URL —';
  }

  function applyCredToOllamaForm(cred) {
    var url = cred && cred.openaiBaseUrl ? String(cred.openaiBaseUrl).trim() : '';
    var locEl = document.getElementById('ollamaFmLocation');
    var pl = document.getElementById('ollamaFmPortLocal');
    var pn = document.getElementById('ollamaFmPortNetwork');
    var hostEl = document.getElementById('ollamaFmNetworkHost');
    var customEl = document.getElementById('ollamaFmCustomUrl');
    if (!locEl) return;
    if (!url) {
      locEl.value = 'this_pc';
      if (pl) pl.value = '11434';
      if (pn) pn.value = '11434';
      if (hostEl) hostEl.value = '';
      if (customEl) customEl.value = '';
      syncOllamaFormVisibility();
      return;
    }
    try {
      var raw = /^https?:\/\//i.test(url) ? url : 'http://' + url;
      var uu = new URL(raw);
      var path = uu.pathname && uu.pathname !== '/' ? uu.pathname : '';
      if (path && path !== '/v1' && path.indexOf('/v1/') !== 0) {
        locEl.value = 'custom';
        if (customEl) customEl.value = url;
        if (pl) pl.value = '11434';
        if (pn) pn.value = '11434';
        syncOllamaFormVisibility();
        return;
      }
      var host = uu.hostname;
      var port = uu.port ? parseInt(uu.port, 10) : 11434;
      if (!Number.isFinite(port) || port < 1) port = 11434;
      if (host === '127.0.0.1' || host === 'localhost') {
        locEl.value = 'this_pc';
        if (pl) pl.value = String(port);
      } else {
        locEl.value = 'network';
        if (hostEl) hostEl.value = host;
        if (pn) pn.value = String(port);
      }
    } catch (e1) {
      locEl.value = 'custom';
      if (customEl) customEl.value = url;
    }
    syncOllamaFormVisibility();
  }

  function populateOllamaFromStore() {
    try {
      var a = fdApi();
      if (!a) return;
      var bearerEl = document.getElementById('ollamaFmBearer');
      if (bearerEl) {
        bearerEl.value = '';
        bearerEl.placeholder = 'Leave blank for no auth or to keep saved key';
      }
      Promise.all([a.getConsultantByokMeta(), a.getConsultantByokCredentials()]).then(function (tuple) {
        var m = tuple[0] || {};
        var cred = tuple[1] || {};
        applyCredToOllamaForm(cred);
        if (m && m.hasKey && bearerEl) {
          bearerEl.placeholder = 'Leave blank to keep saved API key / token';
        }
        var metaEl = document.getElementById('ollamaFmModelsMeta');
        if (metaEl) metaEl.textContent = 'Loading models…';
        var mid = (cred.modelId && String(cred.modelId)) || '';
        return a.listSavedByokProviderModels().then(function (r) {
          return { r: r, cred: cred, mid: mid, m: m };
        });
      })
        .then(function (x) {
          if (!x) return;
          var r = x.r;
          var cred = x.cred || {};
          var mid = x.mid || '';
          var metaEl2 = document.getElementById('ollamaFmModelsMeta');
          if (!r || !r.ok) {
            fillOllamaModelSelect([], mid);
            if (metaEl2)
              metaEl2.textContent = r && r.error ? String(r.error) : 'Could not list models — check connection.';
            return;
          }
          fillOllamaModelSelect(r.models || [], mid);
          var n = (r.models && r.models.length) || 0;
          if (metaEl2) {
            if (n === 0 && r.emptyHint) {
              metaEl2.textContent = r.emptyHint;
            } else {
              metaEl2.textContent =
                n + ' model(s) — pick one, then Save Ollama' + (mid ? ' · saved: ' + mid : '');
            }
          }
        })
        .catch(function () {
          var mx = document.getElementById('ollamaFmModelsMeta');
          if (mx) mx.textContent = 'Could not load models.';
        });
    } catch (eO) {}
  }

  function runOllamaRefreshModels() {
    var meta = document.getElementById('ollamaFmModelsMeta');
    var base = buildOllamaEffectiveBaseUrl();
    var bearerEl = document.getElementById('ollamaFmBearer');
    var keyRaw = bearerEl ? bearerEl.value.trim() : '';
    if (meta) meta.textContent = 'Loading…';
    if (!base) {
      if (meta) meta.textContent = 'Enter hostname, IP, or custom URL first.';
      fillOllamaModelSelect([], '');
      return;
    }
    try {
      var a = fdApi();
      if (!a) {
        if (meta) meta.textContent = 'Desktop app required.';
        return;
      }
      a
        .listByokProviderModels({
          provider: 'openai',
          apiKey: keyRaw,
          openaiBaseUrl: base,
        })
        .then(function (r) {
          return a.getConsultantByokCredentials().then(function (cred) {
            return { r: r, cred: cred || {} };
          });
        })
        .then(function (x) {
          var r = x.r;
          var cred = x.cred || {};
          var savedModel = (cred.modelId && String(cred.modelId)) || '';
          if (!r || !r.ok) {
            if (meta) meta.textContent = (r && r.error) ? String(r.error) : 'Failed to list models.';
            fillOllamaModelSelect([], savedModel);
            return;
          }
          fillOllamaModelSelect(r.models || [], savedModel);
          if (meta) {
            var n = (r.models && r.models.length) || 0;
            if (n === 0 && r.emptyHint) {
              meta.textContent = r.emptyHint;
            } else {
              meta.textContent =
                n + ' model(s) — pick one, then Save Ollama' + (keyRaw ? '' : ' (default auth)');
            }
          }
        })
        .catch(function (e) {
          if (meta) meta.textContent = String(e && e.message ? e.message : e);
          fillOllamaModelSelect([], '');
        });
    } catch (eG) {
      if (meta) meta.textContent = String(eG && eG.message ? eG.message : eG);
    }
  }

  function syncByokOpenaiCompatRow() {
    var provEl = document.getElementById('aiFarmBotByokProvider');
    var row = document.getElementById('aiFarmBotByokOpenaiBaseRow');
    if (!row) return;
    if (provEl && provEl.value === 'openai_compat') {
      row.classList.remove('d-none');
    } else {
      row.classList.add('d-none');
    }
  }

  function runByokRefreshModels() {
    var meta = document.getElementById('aiFarmBotByokModelsMeta');
    var provEl = document.getElementById('aiFarmBotByokProvider');
    var keyEl = document.getElementById('aiFarmBotByokKey');
    var baseEl = document.getElementById('aiFarmBotByokOpenaiBase');
    var prov = provEl && provEl.value === 'gemini' ? 'gemini' : 'openai';
    var keyRaw = keyEl ? keyEl.value.trim() : '';
    var openaiBase = baseEl ? String(baseEl.value || '').trim() : '';
    if (meta) meta.textContent = 'Loading…';
    try {
      var a = fdApi();
      if (!a) {
        if (meta) meta.textContent = 'Desktop app required for BYOK model list.';
        return;
      }
      var p = (keyRaw || openaiBase
        ? a.listByokProviderModels({
            provider: prov,
            apiKey: keyRaw,
            openaiBaseUrl: openaiBase || undefined,
          })
        : a.listSavedByokProviderModels());
      p.then(function (r) {
          return a.getConsultantByokCredentials().then(function (cred) {
            return { r: r, cred: cred || {} };
          });
        })
        .then(function (x) {
          var r = x.r;
          var cred = x.cred || {};
          var savedModel = (cred.modelId && String(cred.modelId)) || '';
          if (!r || !r.ok) {
            if (meta) meta.textContent = (r && r.error) ? String(r.error) : 'Failed to list models.';
            fillByokModelSelect([], savedModel);
            return;
          }
          fillByokModelSelect(r.models || [], savedModel);
          if (meta) {
            var n = (r.models && r.models.length) || 0;
            if (n === 0 && r.emptyHint) {
              meta.textContent = r.emptyHint;
            } else {
              meta.textContent =
                n +
                ' models — pick one, then Save BYOK' +
                (keyRaw ? '' : ' (using saved key)');
            }
          }
        })
        .catch(function (e) {
          if (meta) meta.textContent = String(e && e.message ? e.message : e);
          fillByokModelSelect([], '');
        });
    } catch (eG) {
      if (meta) meta.textContent = String(eG && eG.message ? eG.message : eG);
    }
  }

  function populateByokFromStore() {
    try {
      var a = fdApi();
      if (!a) return;
      var clearCb = document.getElementById('aiFarmBotClearByok');
      if (clearCb) clearCb.checked = false;
      Promise.all([a.getConsultantByokMeta(), a.getConsultantByokCredentials()]).then(function (tuple) {
        var m = tuple[0] || {};
        var cred = tuple[1] || {};
        var prov = document.getElementById('aiFarmBotByokProvider');
        var keyEl = document.getElementById('aiFarmBotByokKey');
        var baseEl = document.getElementById('aiFarmBotByokOpenaiBase');
        if (prov) {
          if (cred.provider === 'gemini') prov.value = 'gemini';
          else if (cred.provider === 'openai_compat') prov.value = 'openai_compat';
          else prov.value = 'openai';
        }
        if (baseEl) baseEl.value = cred.openaiBaseUrl ? String(cred.openaiBaseUrl) : '';
        syncByokOpenaiCompatRow();
        if (keyEl) {
          keyEl.value = '';
          keyEl.placeholder =
            m && m.hasKey ? '•••• leave blank to keep saved key' : 'sk-… or AIza… or ollama';
        }
        var csvEl = document.getElementById('aiFarmBotByokModelIdsCsv');
        var addEl = document.getElementById('aiFarmBotByokAdditionalKeys');
        if (csvEl) csvEl.value = '';
        if (addEl) addEl.value = '';
        if (m && (m.hasKey || m.hasOpenaiBaseUrl)) {
          var metaEl = document.getElementById('aiFarmBotByokModelsMeta');
          if (metaEl) metaEl.textContent = 'Loading models…';
          a
            .listSavedByokProviderModels()
            .then(function (r) {
              return a.getConsultantByokCredentials().then(function (cred) {
                return { r: r, cred: cred || {} };
              });
            })
            .then(function (x) {
              var r = x.r;
              var cred = x.cred || {};
              var metaEl2 = document.getElementById('aiFarmBotByokModelsMeta');
              var mid = (cred.modelId && String(cred.modelId)) || '';
              var csvEl2 = document.getElementById('aiFarmBotByokModelIdsCsv');
              var addEl2 = document.getElementById('aiFarmBotByokAdditionalKeys');
              if (csvEl2) csvEl2.value = cred.modelIdsCsv ? String(cred.modelIdsCsv) : '';
              if (addEl2) addEl2.value = cred.additionalKeys ? String(cred.additionalKeys) : '';
              if (!r || !r.ok) {
                fillByokModelSelect([], mid);
                if (metaEl2)
                  metaEl2.textContent = r && r.error ? String(r.error) : 'Could not load model list.';
                return;
              }
              fillByokModelSelect(r.models || [], mid);
              if (metaEl2) {
                var nSaved = (r.models && r.models.length) || 0;
                if (nSaved === 0 && r.emptyHint) {
                  metaEl2.textContent = r.emptyHint;
                } else {
                  var extraK = m && typeof m.extraKeyLines === 'number' ? m.extraKeyLines : 0;
                  metaEl2.textContent =
                    nSaved +
                    ' models' +
                    (mid ? ' · saved: ' + mid : ' · choose a model and Save BYOK') +
                    (extraK ? ' · +' + extraK + ' extra key line(s)' : '');
                }
              }
            });
        } else {
          fillByokModelSelect([], '');
          var mx = document.getElementById('aiFarmBotByokModelsMeta');
          if (mx) mx.textContent = 'Enter your API key or local base URL, then click Refresh models.';
        }
      });
    } catch (e2) {}
  }

  function loadPanel() {
    var container = document.getElementById('aiFarmBotPanelBody');
    if (!container) return;
    container.innerHTML = '<p class="text-muted">Loading…</p>';

    function doFetch(base, key) {
      var b = normalizeHostedAiBaseUrl(base || '') || 'http://127.0.0.1:8080';
      if (!key) {
        render(
          container,
          null,
          'Connection is not ready yet. Click <strong>Save & load</strong> below, or use a build from your host that includes the link key.'
        );
        return;
      }
      try {
        if (typeof dashAiDebug === 'function') {
          dashAiDebug('ai-farm-bot-panel', 'request', {
            url: b + '/api/integration/overview',
            method: 'GET',
            headers: { 'X-FarmDash-Key': '(redacted)' },
          });
        }
      } catch (eDbg0) {}
      fetch(b + '/api/integration/overview', {
        headers: { 'X-FarmDash-Key': encodeURIComponent(key) },
      })
        .then(function (r) {
          pl('renderer_out', 'GET /api/integration/overview (AI Farm Manager status)', {
            httpStatus: r.status,
            base: b,
          });
          if (r.status === 401) throw new Error('401 — contact your host (link key mismatch).');
          if (r.status === 404) {
            throw new Error(
              'HTTP 404 — wrong URL path. Use the server root only (e.g. http://192.168.1.10:8081), not /health, /admin, or /api. Re-save after fixing.'
            );
          }
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (data) {
          try {
            if (typeof dashAiDebug === 'function') {
              dashAiDebug('ai-farm-bot-panel', 'response', { body: data });
            }
          } catch (eDbg2) {}
          return data;
        })
        .then(function (data) {
          render(container, data, null, b, key);
          // When the API returns a subscription tier / plan name, show #aiFarmBotSubscriptionTierRow and set text, e.g.:
          // var tr = document.getElementById('aiFarmBotCurrentTierText');
          // var row = document.getElementById('aiFarmBotSubscriptionTierRow');
          // if (data && data.subscriptionPlan != null && tr && row) {
          //   tr.textContent = String(data.subscriptionPlan);
          //   row.classList.remove('d-none');
          // }
        })
        .catch(function (e) {
          try {
            if (typeof dashAiDebug === 'function') {
              dashAiDebug('ai-farm-bot-panel', 'error', { message: String(e && e.message ? e.message : e) });
            }
          } catch (eDbg3) {}
          pl('renderer_err', 'GET /api/integration/overview failed', { error: String(e.message || e) });
          render(container, null, String(e.message || e));
        });
    }

    var a = fdApi();
    if (a) {
      a
        .getAiManagerConnection()
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
    } else {
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
    var aSync = fdApi();
    if (aSync) {
      aSync.getAiManagerConnection().then(function (c) {
        if (urlIn && c && c.baseUrl) urlIn.value = c.baseUrl;
        if (keyIn && c && c.integrationKey) keyIn.value = c.integrationKey;
        var pushCb = document.getElementById('aiFarmBotPushSnapshots');
        if (pushCb && c) pushCb.checked = !!c.pushSnapshots;
      });
    }

    var quickApply = document.getElementById('aiFarmHostedQuickApply');
    var quickHost = document.getElementById('aiFarmHostedQuickHost');
    var quickPort = document.getElementById('aiFarmHostedQuickPort');
    var quickHttps = document.getElementById('aiFarmHostedQuickHttps');
    if (quickApply && urlIn) {
      quickApply.addEventListener('click', function () {
        var h = quickHost && quickHost.value ? String(quickHost.value).trim() : '';
        var p = quickPort && quickPort.value != null ? parseInt(String(quickPort.value), 10) : NaN;
        if (!h) {
          if (quickHost) quickHost.focus();
          return;
        }
        if (!Number.isFinite(p) || p < 1 || p > 65535) {
          if (quickPort) quickPort.focus();
          return;
        }
        var scheme = quickHttps && quickHttps.checked ? 'https' : 'http';
        urlIn.value = scheme + '://' + h + ':' + p;
        try {
          urlIn.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (eEv) {}
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var pushCb = document.getElementById('aiFarmBotPushSnapshots');
        var pushSnapshots = !!(pushCb && pushCb.checked);
        var baseVal = urlIn ? urlIn.value.trim().replace(/\/$/, '') : '';
        var keyVal = keyIn && !keyIn.closest('.d-none') ? keyIn.value.trim() : '';
        if (baseVal) localStorage.setItem(LS_URL, baseVal);
        if (keyVal) localStorage.setItem(LS_KEY, keyVal);

        var saveErr = null;
        try {
          var ipc0 = fdApi();
          if (!ipc0) throw new Error('Desktop app API unavailable');
          await ipc0.saveAiManagerConnection({
            baseUrl: baseVal,
            integrationKey: keyVal,
            pushSnapshots: pushSnapshots,
          });
        } catch (e0) {
          saveErr = e0;
          var ban = document.getElementById('aiFarmBotConnectionBanner');
          if (ban) {
            ban.classList.remove('d-none', 'alert-success', 'alert-warning', 'alert-info', 'alert-secondary');
            ban.classList.add('alert-danger');
            ban.innerHTML =
              '<strong>Save failed.</strong> ' +
              esc(String(e0 && e0.message ? e0.message : e0));
          }
        }

        if (!saveErr) {
          loadPanel();
        }
      });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', loadPanel);

    var hostedSubBtn = document.getElementById('ai-fm-subtab-hosted-btn');
    if (hostedSubBtn) {
      hostedSubBtn.addEventListener('shown.bs.tab', function () {
        loadPanel();
      });
    }
    var byokSubBtn = document.getElementById('ai-fm-subtab-byok-btn');
    if (byokSubBtn) {
      byokSubBtn.addEventListener('shown.bs.tab', function () {
        populateByokFromStore();
      });
    }

    var ollamaSubBtn = document.getElementById('ai-fm-subtab-ollama-btn');
    if (ollamaSubBtn) {
      ollamaSubBtn.addEventListener('shown.bs.tab', function () {
        populateOllamaFromStore();
      });
    }

    var ollamaLocEl = document.getElementById('ollamaFmLocation');
    if (ollamaLocEl) {
      ollamaLocEl.addEventListener('change', syncOllamaFormVisibility);
    }
    ['ollamaFmPortLocal', 'ollamaFmPortNetwork', 'ollamaFmNetworkHost', 'ollamaFmCustomUrl'].forEach(function (oid) {
      var el = document.getElementById(oid);
      if (el) {
        el.addEventListener('input', updateOllamaPreview);
        el.addEventListener('change', updateOllamaPreview);
      }
    });
    if (document.getElementById('ollamaFmLocation')) {
      syncOllamaFormVisibility();
    }

    var ollamaRefreshBtn = document.getElementById('ollamaFmRefreshModels');
    if (ollamaRefreshBtn) ollamaRefreshBtn.addEventListener('click', runOllamaRefreshModels);

    var ollamaSaveBtn = document.getElementById('ollamaFmSave');
    if (ollamaSaveBtn) {
      ollamaSaveBtn.addEventListener('click', async function () {
        var base = buildOllamaEffectiveBaseUrl();
        var hint = document.getElementById('ollamaFmSaveHint');
        var modelSel = document.getElementById('ollamaFmModelSelect');
        var modelId = modelSel && modelSel.value != null ? String(modelSel.value).trim() : '';
        var bearerEl = document.getElementById('ollamaFmBearer');
        var bearerRaw = bearerEl ? bearerEl.value.trim() : '';
        if (!base) {
          if (hint) {
            hint.textContent = 'Set where Ollama runs (hostname, IP, or custom URL).';
            hint.classList.remove('d-none');
          }
          return;
        }
        try {
          var ipcO = fdApi();
          if (!ipcO) throw new Error('Desktop app API unavailable');
          await ipcO.saveConsultantByokCredentials({
            apiKey: bearerRaw || 'ollama',
            provider: 'openai_compat',
            openaiBaseUrl: base,
            modelId: modelId,
          });
          if (hint) {
            hint.textContent = 'Ollama saved for Smart suggestions.';
            hint.classList.remove('d-none');
          }
          setTimeout(function () {
            if (hint) hint.classList.add('d-none');
          }, 5000);
          populateByokFromStore();
          populateOllamaFromStore();
          if (typeof window.refreshFarmDashConsultantInsights === 'function') {
            window.refreshFarmDashConsultantInsights();
          }
        } catch (eOs) {
          if (hint) {
            hint.textContent = String(eOs && eOs.message ? eOs.message : eOs);
            hint.classList.remove('d-none');
          }
        }
      });
    }

    var byokRefreshBtn = document.getElementById('aiFarmBotByokRefreshModels');
    if (byokRefreshBtn) byokRefreshBtn.addEventListener('click', runByokRefreshModels);

    var byokProvChange = document.getElementById('aiFarmBotByokProvider');
    if (byokProvChange) {
      byokProvChange.addEventListener('change', function () {
        syncByokOpenaiCompatRow();
        var mx = document.getElementById('aiFarmBotByokModelsMeta');
        if (mx) mx.textContent = 'Provider changed — click Refresh models for an updated list.';
        fillByokModelSelect([], '');
      });
    }

    var byokSaveBtn = document.getElementById('aiFarmBotByokSave');
    if (byokSaveBtn) {
      byokSaveBtn.addEventListener('click', async function () {
        var clearByok = document.getElementById('aiFarmBotClearByok');
        var byokKeyEl = document.getElementById('aiFarmBotByokKey');
        var byokKeyRaw = byokKeyEl ? byokKeyEl.value.trim() : '';
        var provElB = document.getElementById('aiFarmBotByokProvider');
        var byokProv =
          provElB && provElB.value === 'gemini'
            ? 'gemini'
            : provElB && provElB.value === 'openai_compat'
              ? 'openai_compat'
              : 'openai';
        var baseElB = document.getElementById('aiFarmBotByokOpenaiBase');
        var openaiBaseSave = baseElB ? String(baseElB.value || '').trim() : '';
        var modelSel = document.getElementById('aiFarmBotByokModelSelect');
        var modelId = modelSel && modelSel.value != null ? String(modelSel.value).trim() : '';
        var hint = document.getElementById('aiFarmBotByokSaveHint');
        try {
          var ipcB = fdApi();
          if (!ipcB) throw new Error('Desktop app API unavailable');
          if (clearByok && clearByok.checked) {
            await ipcB.saveConsultantByokCredentials({ clear: true });
            if (hint) {
              hint.textContent = 'BYOK removed from this PC.';
              hint.classList.remove('d-none');
            }
            fillByokModelSelect([], '');
            populateByokFromStore();
            populateOllamaFromStore();
            return;
          }
          var metaB = await ipcB.getConsultantByokMeta();
          if (!byokKeyRaw && !(metaB && metaB.hasKey) && !(byokProv === 'openai_compat' && openaiBaseSave)) {
            if (hint) {
              hint.textContent =
                'Paste an API key, or choose Local / OpenAI-compatible and enter a base URL (or check Remove saved key if clearing).';
              hint.classList.remove('d-none');
            }
            return;
          }
          var csvElB = document.getElementById('aiFarmBotByokModelIdsCsv');
          var addElB = document.getElementById('aiFarmBotByokAdditionalKeys');
          await ipcB.saveConsultantByokCredentials({
            apiKey: byokKeyRaw,
            provider: byokProv,
            openaiBaseUrl: byokProv === 'openai_compat' ? openaiBaseSave : '',
            modelId: modelId,
            modelIdsCsv: csvElB ? csvElB.value : undefined,
            additionalKeys: addElB ? addElB.value : undefined,
          });
          if (hint) {
            hint.textContent = 'BYOK saved.';
            hint.classList.remove('d-none');
          }
          setTimeout(function () {
            if (hint) hint.classList.add('d-none');
          }, 5000);
          populateByokFromStore();
          populateOllamaFromStore();
        } catch (eByok) {
          if (hint) {
            hint.textContent = String(eByok && eByok.message ? eByok.message : eByok);
            hint.classList.remove('d-none');
          }
        }
      });
    }

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
          h['X-AI-Provider'] = byok.provider === 'gemini' ? 'gemini' : 'openai';
          var ob = byok.openaiBaseUrl && String(byok.openaiBaseUrl).trim();
          if (ob) {
            h['X-AI-OpenAI-Base-URL'] = ob;
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
        try {
          if (typeof dashAiDebug === 'function') {
            var hdrCopy = {};
            for (var hk in headers) {
              if (Object.prototype.hasOwnProperty.call(headers, hk)) {
                hdrCopy[hk] =
                  String(hk).toLowerCase().indexOf('key') >= 0 ? '(redacted)' : headers[hk];
              }
            }
            dashAiDebug('llm-ping', 'request', { url: b + '/api/integration/llm-ping', headers: hdrCopy });
          }
        } catch (ePingDbg) {}
        fetch(b + '/api/integration/llm-ping', { headers: headers })
          .then(function (r) {
            pl('renderer_out', 'GET /api/integration/llm-ping', { httpStatus: r.status });
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
            try {
              if (typeof dashAiDebug === 'function') {
                dashAiDebug('llm-ping', 'response', { status: x.status, body: x.body });
              }
            } catch (ePingRes) {}
            var j = x.body || {};
            if (j.ok) {
              var ms = j.latency_ms != null ? String(j.latency_ms) : '—';
              var prov = j.provider || '—';
              var model = j.model ? ' · ' + j.model : '';
              var det = (j.detail || '').replace(/</g, '');
              llmPingOut.textContent =
                'OK — ' + prov + model + ' · ' + ms + ' ms · ' + det;
              llmPingOut.className = 'small text-success mb-3 mb-md-2';
              pl('renderer_ok', 'LLM ping OK — refreshing Smart suggestions', { provider: prov, ms: ms });
              if (typeof window.refreshFarmDashConsultantInsights === 'function') {
                window.refreshFarmDashConsultantInsights();
              }
            } else {
              llmPingOut.textContent =
                (j.detail || j.message || 'Optional AI not configured or declined.') + '';
              llmPingOut.className = 'small text-muted mb-3 mb-md-2';
            }
          })
          .catch(function (e) {
            try {
              if (typeof dashAiDebug === 'function') {
                dashAiDebug('llm-ping', 'error', { message: String(e && e.message ? e.message : e) });
              }
            } catch (ePingErr) {}
            llmPingOut.textContent =
              'Optional AI check did not complete — the dashboard still works. ' + String(e.message || e);
            llmPingOut.className = 'small text-muted mb-3 mb-md-2';
          });
      }

      try {
        var ipc = fdApi();
        if (!ipc) throw new Error('no api');
        Promise.all([
          ipc.getAiManagerConnection(),
          ipc.getConsultantByokCredentials(),
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
    function runAiFarmManagerPanelOpen() {
      applyBrandingUi();
      populateOllamaFromStore();
      populateByokFromStore();
      loadPanel();
    }
    var appModal = document.getElementById('appSettingsModal');
    var aiTab = document.getElementById('app-settings-tab-ai');
    if (appModal) {
      appModal.addEventListener('shown.bs.modal', function () {
        var pane = document.getElementById('app-settings-pane-ai');
        if (pane && pane.classList.contains('active')) runAiFarmManagerPanelOpen();
      });
    }
    if (aiTab) {
      aiTab.addEventListener('shown.bs.tab', runAiFarmManagerPanelOpen);
    }
    if (installBtn && installOut) {
      installBtn.addEventListener('click', function () {
        var sel = document.getElementById('aiFarmBotInstanceSelect');
        var id = sel && sel.value;
        if (!id) {
          installOut.textContent = 'Select a bot profile.';
          return;
        }
        var ipc = fdApi();
        if (!ipc) {
          installOut.textContent = 'Use the desktop app. Or download XML from your host’s admin.';
          return;
        }
        installOut.textContent = 'Writing…';
        ipc
          .getAiManagerConnection()
          .then(function (c) {
            var base = (c && c.baseUrl) || getBase() || '';
            var key = (c && c.integrationKey) || getKey() || '';
            if (!key) {
              installOut.textContent = 'Save hosted connection first (Hosted AI tab — URL + link key).';
              return Promise.reject(new Error('__skip_install__'));
            }
            return ipc.aiFarmInstallConfigXml({
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
