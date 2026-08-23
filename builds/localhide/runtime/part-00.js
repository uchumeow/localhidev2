(function () {
  "use strict";
var __lhActionSheet = vendetta.metro.findByProps("openLazy", "hideActionSheet");
var bunny = {
  metro: vendetta.metro,
  api: { patcher: vendetta.patcher },
  ui: {
    toasts: vendetta.ui.toasts,
    alerts: vendetta.ui.alerts,
    assets: vendetta.ui.assets,
    navigation: vendetta.metro.common.navigation,
    sheets: {
      showSheet: function (key, component, props) {
        if (!__lhActionSheet || typeof __lhActionSheet.openLazy !== "function") return;
        var lazy = component && typeof component.then === "function"
          ? component
          : Promise.resolve({ default: component });
        return __lhActionSheet.openLazy(lazy, key, props || {});
      },
      hideSheet: function (key) {
        return __lhActionSheet && __lhActionSheet.hideActionSheet
          ? __lhActionSheet.hideActionSheet(key)
          : undefined;
      }
    }
  },
  plugin: {
    createStorage: function () { return vendetta.plugin.storage; },
    logger: vendetta.logger || console
  }
};
var definePlugin = function (plugin) { return plugin; };
"use strict";
var LocalHide;
(function (LocalHide) {
    LocalHide.SCHEMA_VERSION = 1;
    LocalHide.PLUGIN_VERSION = "0.1.0";
    LocalHide.PASSWORD_MIN_LENGTH = 8;
    LocalHide.KDF_ITERATIONS = 310000;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    function nowIso() {
        return new Date().toISOString();
    }
    LocalHide.nowIso = nowIso;
    function conversationKey(channelId, otherUserId) {
        return `${channelId}:${otherUserId}`;
    }
    LocalHide.conversationKey = conversationKey;
    function uniqueStrings(values) {
        return Array.from(new Set(Array.from(values).filter(Boolean)));
    }
    LocalHide.uniqueStrings = uniqueStrings;
    function stableSortMessages(messages) {
        return messages.slice().sort((a, b) => {
            const at = Date.parse(a.timestamp) || 0;
            const bt = Date.parse(b.timestamp) || 0;
            return at === bt ? a.messageId.localeCompare(b.messageId) : at - bt;
        });
    }
    LocalHide.stableSortMessages = stableSortMessages;
    function utf8Encode(text) {
        if (typeof TextEncoder !== "undefined")
            return new TextEncoder().encode(text);
        const escaped = unescape(encodeURIComponent(text));
        const out = new Uint8Array(escaped.length);
        for (let i = 0; i < escaped.length; i++)
            out[i] = escaped.charCodeAt(i);
        return out;
    }
    LocalHide.utf8Encode = utf8Encode;
    function utf8Decode(bytes) {
        if (typeof TextDecoder !== "undefined")
            return new TextDecoder().decode(bytes);
        let raw = "";
        for (const byte of bytes)
            raw += String.fromCharCode(byte);
        return decodeURIComponent(escape(raw));
    }
    LocalHide.utf8Decode = utf8Decode;
    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    function bytesToBase64(bytes) {
        let out = "";
        for (let i = 0; i < bytes.length; i += 3) {
            const a = bytes[i] ?? 0;
            const b = bytes[i + 1] ?? 0;
            const c = bytes[i + 2] ?? 0;
            const n = (a << 16) | (b << 8) | c;
            out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63];
            out += i + 1 < bytes.length ? B64[(n >>> 6) & 63] : "=";
            out += i + 2 < bytes.length ? B64[n & 63] : "=";
        }
        return out;
    }
    LocalHide.bytesToBase64 = bytesToBase64;
    function base64ToBytes(text) {
        const clean = text.replace(/\s/g, "");
        if (!clean || clean.length % 4 !== 0)
            throw new Error("Malformed base64");
        const bytes = [];
        for (let i = 0; i < clean.length; i += 4) {
            const chars = clean.slice(i, i + 4);
            const vals = chars.split("").map(c => c === "=" ? 0 : B64.indexOf(c));
            if (vals.some(v => v < 0))
                throw new Error("Malformed base64");
            const n = (vals[0] << 18) | (vals[1] << 12) | (vals[2] << 6) | vals[3];
            bytes.push((n >>> 16) & 255);
            if (chars[2] !== "=")
                bytes.push((n >>> 8) & 255);
            if (chars[3] !== "=")
                bytes.push(n & 255);
        }
        return new Uint8Array(bytes);
    }
    LocalHide.base64ToBytes = base64ToBytes;
    function safeString(value, fallback = "") {
        return typeof value === "string" ? value : fallback;
    }
    LocalHide.safeString = safeString;
    function cloneSnapshot(snapshot) {
        return JSON.parse(JSON.stringify(snapshot));
    }
    LocalHide.cloneSnapshot = cloneSnapshot;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    const storagePromiseSymbol = Symbol.for("bunny.storage.promise");
    let storage = null;
    let initialized = false;
    const hiddenSets = new Map();
    const sessions = new Map();
    LocalHide.compatibility = {
        messageFilter: false,
        messageActions: false,
        profilePanel: false,
        navigation: false,
        crypto: false,
        diagnostics: []
    };
    function diag(message) {
        LocalHide.compatibility.diagnostics.push(message);
        if (LocalHide.compatibility.diagnostics.length > 30)
            LocalHide.compatibility.diagnostics.shift();
        try {
            bunny.plugin?.logger?.log?.(`[LocalHide] ${message}`);
        }
        catch { }
    }
    LocalHide.diag = diag;
    async function ensureStorage() {
        if (!storage) {
            const created = bunny.plugin.createStorage();
            storage = created;
            const maybePromise = created[storagePromiseSymbol];
            if (maybePromise?.then)
                await maybePromise;
        }
        const root = storage;
        if (!initialized) {
            if (typeof root.schemaVersion !== "number")
                root.schemaVersion = LocalHide.SCHEMA_VERSION;
            if (typeof root.enabled !== "boolean")
                root.enabled = true;
            if (!root.conversations || typeof root.conversations !== "object")
                root.conversations = {};
            migrate(root);
            rebuildHiddenSets(root);
            initialized = true;
        }
        return root;
    }
    LocalHide.ensureStorage = ensureStorage;
    function migrate(root) {
        if (root.schemaVersion > LocalHide.SCHEMA_VERSION)
            throw new Error(`Unsupported LocalHide schema ${root.schemaVersion}`);
        if (root.schemaVersion < 1)
            root.schemaVersion = 1;
        for (const key of Object.keys(root.conversations ?? {})) {
            const record = root.conversations[key];
            if (!record || record.schemaVersion !== 1 || !record.channelId || !record.otherUserId) {
                delete root.conversations[key];
                diag(`Removed malformed conversation record ${key}`);
                continue;
            }
            record.hiddenIds = LocalHide.uniqueStri