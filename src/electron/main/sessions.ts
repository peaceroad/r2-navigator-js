import * as debug_ from "debug";
import { Certificate, app, session } from "electron";

import { Server } from "@r2-streamer-js/http/server";

import { R2_SESSION_WEBVIEW } from "../common/sessions";

const debug = debug_("r2:electron:main");

export function configureWebViewSession(server: Server) {

    const webViewSession = getWebViewSession();
    if (!webViewSession) {
        return;
    }

    const urlFilter = server.serverUrl() + "/*";
    debug(urlFilter);

    const filter = { urls: ["*"] };

    webViewSession.webRequest.onBeforeSendHeaders(filter, (details: any, callback: any) => {
        debug("onBeforeSendHeaders");
        debug(details);

        details.requestHeaders["User-Agent"] = "R2";

        if (server.isSecured()) {
            const info = server.serverInfo();
            if (info) {
                details.requestHeaders["X-Debug-" + info.trustKey] = info.trustVal;
            }
        }
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    webViewSession.setCertificateVerifyProc((request, callback) => {
        debug("setCertificateVerifyProc");
        debug(request);

        if (server.isSecured()) {
            const info = server.serverInfo();
            if (info) {
                debug(info);
                if (request.hostname === info.urlHost) {
                    callback(0); // OK
                    return;
                }
            }
        }
        callback(-3); // Chromium
        // callback(-2); // Fail
    });

    app.on("certificate-error", (event, _webContents, url, error, certificate, callback) => {
        debug("certificate-error");
        debug(url);
        debug(error);
        debug(certificate);

        if (server.isSecured()) {
            const info = server.serverInfo();
            if (info) {
                debug(info);
                if (url.indexOf(server.serverUrl() as string) >= 0) {
                    event.preventDefault();
                    callback(true);
                    return;
                }
            }
        }

        callback(false);
    });

    app.on("select-client-certificate", (event, _webContents, url, list, callback) => {
        debug("select-client-certificate");
        debug(url);
        debug(list);

        if (server.isSecured()) {
            const info = server.serverInfo();
            if (info) {
                debug(info);
                if (url.indexOf(server.serverUrl() as string) >= 0) {
                    event.preventDefault();
                    callback({ data: info.clientcert } as Certificate);
                    return;
                }
            }
        }

        callback();
    });
}

export function initSessions() {

    app.on("ready", () => {
        debug("app ready");

        clearSessions(undefined, undefined);
        const webViewSession = getWebViewSession();
        if (webViewSession) {
            webViewSession.setPermissionRequestHandler((wc, permission, callback) => {
                debug("setPermissionRequestHandler");
                debug(wc.getURL());
                debug(permission);
                callback(true);
            });
        }
    });

    function willQuitCallback(evt: Electron.Event) {
        debug("app will quit");

        app.removeListener("will-quit", willQuitCallback);

        let done = false;

        setTimeout(() => {
            if (done) {
                return;
            }
            done = true;
            debug("Cache and StorageData clearance waited enough => force quitting...");
            app.quit();
        }, 6000);

        let sessionCleared = 0;
        const callback = () => {
            sessionCleared++;
            if (sessionCleared >= 2) {
                if (done) {
                    return;
                }
                done = true;
                debug("Cache and StorageData cleared, now quitting...");
                app.quit();
            }
        };
        clearSessions(callback, callback);

        evt.preventDefault();
    }

    app.on("will-quit", willQuitCallback);
}

export function clearSession(
    sess: Electron.Session,
    str: string,
    callbackCache: (() => void) | undefined,
    callbackStorageData: (() => void) | undefined) {

    sess.clearCache(() => {
        debug("SESSION CACHE CLEARED - " + str);
        if (callbackCache) {
            callbackCache();
        }
    });
    sess.clearStorageData({
        origin: "*",
        quotas: [
            "temporary",
            "persistent",
            "syncable"],
        storages: [
            "appcache",
            "cookies",
            "filesystem",
            "indexdb",
            "localstorage",
            "shadercache",
            "websql",
            "serviceworkers"],
    }, () => {
        debug("SESSION STORAGE DATA CLEARED - " + str);
        if (callbackStorageData) {
            callbackStorageData();
        }
    });
}

export function getWebViewSession() {
    return session.fromPartition(R2_SESSION_WEBVIEW, { cache: true });
}

export function clearWebviewSession(
    callbackCache: (() => void) | undefined,
    callbackStorageData: (() => void) | undefined) {

    const sess = getWebViewSession();
    if (sess) {
        clearSession(sess, "[" + R2_SESSION_WEBVIEW + "]", callbackCache, callbackStorageData);
    } else {
        if (callbackCache) {
            callbackCache();
        }
        if (callbackStorageData) {
            callbackStorageData();
        }
    }
}

export function clearDefaultSession(
    callbackCache: (() => void) | undefined,
    callbackStorageData: (() => void) | undefined) {

    if (session.defaultSession) {
        // const proto = session.defaultSession.protocol;
        clearSession(session.defaultSession, "[default]", callbackCache, callbackStorageData);
    } else {
        if (callbackCache) {
            callbackCache();
        }
        if (callbackStorageData) {
            callbackStorageData();
        }
    }
}

export function clearSessions(
    callbackCache: (() => void) | undefined,
    callbackStorageData: (() => void) | undefined) {

    let done = false;

    setTimeout(() => {
        if (done) {
            return;
        }
        done = true;
        debug("Cache and StorageData clearance waited enough (default session) => force webview session...");
        clearWebviewSession(callbackCache, callbackStorageData);
    }, 6000);

    let sessionCleared = 0;
    const callback = () => {
        sessionCleared++;
        if (sessionCleared >= 2) {
            if (done) {
                return;
            }
            done = true;
            debug("Cache and StorageData cleared (default session), now webview session...");
            clearWebviewSession(callbackCache, callbackStorageData);
        }
    };
    clearDefaultSession(callback, callback);
}
