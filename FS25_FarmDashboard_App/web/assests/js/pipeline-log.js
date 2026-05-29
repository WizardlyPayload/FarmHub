/**
 * Farm Dashboard — DevTools console tracing (data / merge pipeline).
 * Open DevTools (F12) → Console → filter: Pipeline
 */
(function (g) {
  function pipelineLog(stage, message, meta) {
    var line = '[Pipeline] ' + stage + (message != null && message !== '' ? ' — ' + message : '');
    if (meta !== undefined && meta !== null) {
      console.info(line, meta);
    } else {
      console.info(line);
    }
  }
  g.pipelineLog = pipelineLog;
})(typeof globalThis !== 'undefined' ? globalThis : window);
