/**
 * Mutually exclusive Smart suggestions modes: Hosted AI | Gemini BYOK | OpenAI-compatible | Ollama.
 * Works with main process IPC save-ai-suggestion-settings / get-ai-suggestion-settings.
 */
(function () {
  function fdApi() {
    return typeof window !== 'undefined' && window.farmDashAPI ? window.farmDashAPI : null;
  }

  function normalizeHostedBase(b) {
    const s = String(b || '').trim().replace(/\/$/, '');
    if (!s) return '';
    try {
      const href = /^https?:\/\//i.test(s) ? s : 'http://' + s;
      return new URL(href).origin;
    } catch (e) {
      return s;
    }
  }

  function setPaneDisabled(wrap, disabled) {
    if (!wrap) return;
    wrap.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    wrap.style.opacity = disabled ? '0.45' : '';
    wrap.style.pointerEvents = disabled ? 'none' : '';
    wrap.querySelectorAll('input, select, textarea, button').forEach(function (el) {
      if (el.closest && el.closest('#ai-suggestion-mode-card')) return;
      el.disabled = !!disabled;
    });
  }

  function applyModeToUi(mode) {
    var hosted = document.getElementById('ai-fm-pane-hosted-wrap');
    var gemini = document.getElementById('ai-fm-pane-gemini-wrap');
    var ollama = document.getElementById('ai-fm-pane-ollama-wrap');
    var m = mode || '';
    setPaneDisabled(hosted, m !== 'hosted');
    setPaneDisabled(gemini, m !== 'gemini_byok' && m !== 'openai_compat');
    setPaneDisabled(ollama, m !== 'ollama');
    var hint = document.getElementById('aiModeHint');
    if (hint) {
      if (m === 'hosted') {
        hint.textContent =
          'Farm snapshots are sent to your AI server (when enabled). In-game !hank uses this connection.';
      } else if (m === 'gemini_byok') {
        hint.textContent = 'Google Gemini only — keys stay on this PC. Nothing is pushed to a Farm Dashboard server.';
      } else if (m === 'openai_compat') {
        hint.textContent =
          'LM Studio, vLLM, or other OpenAI-compatible servers — keys and snapshots stay on this PC. No Farm Dashboard server push.';
      } else if (m === 'ollama') {
        hint.textContent = 'Ollama preset — local or LAN. No snapshot push.';
      } else {
        hint.textContent = 'Select one mode and save.';
      }
    }
  }

  function gatherPayload(mode) {
    var p = { mode: mode };
    if (mode === 'hosted') {
      var urlEl = document.getElementById('aiFarmBotBaseUrl');
      var keyEl = document.getElementById('aiFarmBotIntegrationKey');
      var pushEl = document.getElementById('aiFarmBotPushSnapshots');
      p.hosted = {
        baseUrl: urlEl ? String(urlEl.value || '').trim() : '',
        integrationKey: keyEl && !keyEl.closest('.d-none') ? String(keyEl.value || '').trim() : '',
        pushSnapshots: !!(pushEl && pushEl.checked),
      };
    } else if (mode === 'gemini_byok') {
      var gk = document.getElementById('aiFarmBotByokKey');
      var gm = document.getElementById('aiFarmBotByokModelSelect');
      p.gemini = {
        apiKey: gk ? String(gk.value || '').trim() : '',
        modelId: gm && gm.value ? String(gm.value).trim() : '',
        modelIdsCsv: '',
      };
    } else if (mode === 'openai_compat') {
      var ok = document.getElementById('aiFarmBotByokKey');
      var ob = document.getElementById('aiFarmBotByokOpenaiBase');
      var om = document.getElementById('aiFarmBotByokModelSelect');
      var ocsv = document.getElementById('aiFarmBotByokModelIdsCsv');
      var oadd = document.getElementById('aiFarmBotByokAdditionalKeys');
      p.openai_compat = {
        baseUrl: ob ? String(ob.value || '').trim() : '',
        apiKey: ok ? String(ok.value || '').trim() : '',
        modelId: om && om.value ? String(om.value).trim() : '',
        modelIdsCsv: ocsv ? String(ocsv.value || '').trim() : '',
        additionalKeys: oadd ? String(oadd.value || '').trim() : '',
      };
    } else if (mode === 'ollama') {
      var base = '';
      var loc = document.getElementById('ollamaFmLocation');
      var modeLoc = loc ? loc.value : 'this_pc';
      if (modeLoc === 'this_pc') {
        var pl = document.getElementById('ollamaFmPortLocal');
        var port = pl ? parseInt(String(pl.value || '11434'), 10) : 11434;
        if (!Number.isFinite(port) || port < 1) port = 11434;
        base = 'http://127.0.0.1:' + port;
      } else if (modeLoc === 'network') {
        var host = document.getElementById('ollamaFmNetworkHost');
        var pn = document.getElementById('ollamaFmPortNetwork');
        var h = host ? String(host.value || '').trim() : '';
        var p2 = pn ? parseInt(String(pn.value || '11434'), 10) : 11434;
        if (h) base = 'http://' + h + ':' + (Number.isFinite(p2) ? p2 : 11434);
      } else {
        var cu = document.getElementById('ollamaFmCustomUrl');
        base = cu ? String(cu.value || '').trim() : '';
      }
      var ms = document.getElementById('ollamaFmModelSelect');
      p.ollama = {
        baseUrl: base,
        modelId: ms && ms.value ? String(ms.value).trim() : 'llama3.2',
      };
    }
    return p;
  }

  async function loadSettingsIntoForm() {
    var api = fdApi();
    if (!api || typeof api.getAiSuggestionSettings !== 'function') return;
    var st = await api.getAiSuggestionSettings().catch(function () {
      return null;
    });
    if (!st) return;
    var mode = st.mode || '';
    var rHosted = document.getElementById('aiModeHosted');
    var rGem = document.getElementById('aiModeGemini');
    var rOc = document.getElementById('aiModeOpenaiCompat');
    var rOll = document.getElementById('aiModeOllama');
    if (rHosted) rHosted.checked = mode === 'hosted';
    if (rGem) rGem.checked = mode === 'gemini_byok';
    if (rOc) rOc.checked = mode === 'openai_compat';
    if (rOll) rOll.checked = mode === 'ollama';
    if (st.hosted) {
      var u = document.getElementById('aiFarmBotBaseUrl');
      var k = document.getElementById('aiFarmBotIntegrationKey');
      var ps = document.getElementById('aiFarmBotPushSnapshots');
      if (u) u.value = st.hosted.baseUrl || '';
      if (k) k.value = st.hosted.integrationKey || '';
      if (ps) ps.checked = st.hosted.pushSnapshots !== false;
    }
    if (st.gemini) {
      var gk = document.getElementById('aiFarmBotByokKey');
      var gm = document.getElementById('aiFarmBotByokModelSelect');
      if (gk) gk.value = st.gemini.apiKey || '';
      if (gm && st.gemini.modelId) gm.value = st.gemini.modelId;
    }
    if (st.openai_compat) {
      var xk = document.getElementById('aiFarmBotByokKey');
      var xb = document.getElementById('aiFarmBotByokOpenaiBase');
      var xm = document.getElementById('aiFarmBotByokModelSelect');
      var xcsv = document.getElementById('aiFarmBotByokModelIdsCsv');
      var xadd = document.getElementById('aiFarmBotByokAdditionalKeys');
      if (xk) xk.value = st.openai_compat.apiKey || '';
      if (xb) xb.value = st.openai_compat.baseUrl || '';
      if (xm && st.openai_compat.modelId) xm.value = st.openai_compat.modelId;
      if (xcsv) xcsv.value = st.openai_compat.modelIdsCsv || '';
      if (xadd) xadd.value = st.openai_compat.additionalKeys || '';
    }
    var prov = document.getElementById('aiFarmBotByokProvider');
    if (prov) {
      var col = prov.closest('.col-md-4');
      if (mode === 'openai_compat') {
        prov.value = 'openai_compat';
        if (col) col.classList.remove('d-none');
      } else {
        prov.value = 'gemini';
        if (col) col.classList.add('d-none');
      }
    }
    var baseRow = document.getElementById('aiFarmBotByokOpenaiBaseRow');
    if (baseRow) {
      if (mode === 'openai_compat') baseRow.classList.remove('d-none');
      else if (mode === 'gemini_byok') baseRow.classList.add('d-none');
    }
    applyModeToUi(mode);
  }

  async function saveActiveMode() {
    var api = fdApi();
    var hint = document.getElementById('aiSuggestionModeSaveHint');
    if (!api || typeof api.saveAiSuggestionSettings !== 'function') {
      if (hint) {
        hint.textContent = 'Desktop API missing.';
        hint.classList.remove('d-none');
      }
      return;
    }
    var modeEl = document.querySelector('input[name="aiSuggestionModeRadio"]:checked');
    var mode = modeEl ? modeEl.value : '';
    if (!mode) {
      if (hint) {
        hint.textContent = 'Select a mode first.';
        hint.classList.remove('d-none', 'text-success');
        hint.classList.add('text-warning');
      }
      return;
    }
    try {
      var payload = gatherPayload(mode);
      await api.saveAiSuggestionSettings(payload);
      if (hint) {
        hint.textContent = 'Saved.';
        hint.classList.remove('d-none', 'text-warning');
        hint.classList.add('text-success');
      }
      if (typeof window.refreshFarmDashConsultantInsights === 'function') {
        window.refreshFarmDashConsultantInsights(true);
      }
    } catch (e) {
      if (hint) {
        hint.textContent = String((e && e.message) || e);
        hint.classList.remove('d-none', 'text-success');
        hint.classList.add('text-warning');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var card = document.getElementById('ai-suggestion-mode-card');
    if (!card) return;
    document.querySelectorAll('input[name="aiSuggestionModeRadio"]').forEach(function (r) {
      r.addEventListener('change', function () {
        applyModeToUi(r.value);
      });
    });
    var btn = document.getElementById('aiSuggestionModeSaveBtn');
    if (btn) btn.addEventListener('click', saveActiveMode);
    var aiTab = document.getElementById('app-settings-tab-ai');
    var modal = document.getElementById('appSettingsModal');
    function onShow() {
      loadSettingsIntoForm();
    }
    if (aiTab) aiTab.addEventListener('shown.bs.tab', onShow);
    if (modal) modal.addEventListener('shown.bs.modal', function () {
      var pane = document.getElementById('app-settings-pane-ai');
      if (pane && pane.classList.contains('active')) loadSettingsIntoForm();
    });
    loadSettingsIntoForm();
  });
})();
