'use strict';

function ftpAccessOptions(srv) {
  const secure = srv && (srv.ftpSecure === true || srv.ftpSecure === 'explicit' || srv.ftpFtps === true);
  return {
    host: srv.ftpHost,
    port: parseInt(srv.ftpPort, 10) || 21,
    user: srv.ftpUser,
    password: srv.ftpPass,
    secure: !!secure,
    secureOptions: secure
      ? { rejectUnauthorized: srv.ftpAllowInsecureTls === true ? false : true }
      : undefined,
  };
}

module.exports = { ftpAccessOptions };
