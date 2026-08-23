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
            record.hiddenIds = LocalHide.uniqueStrings(record.hiddenIds ?? []);
        }
    }
    LocalHide.migrate = migrate;
    function rebuildHiddenSets(root) {
        hiddenSets.clear();
        for (const [key, record] of Object.entries(root.conversations)) {
            hiddenSets.set(key, new Set(record.hiddenIds));
        }
    }
    function getHiddenSet(key) {
        let set = hiddenSets.get(key);
        if (!set)
            hiddenSets.set(key, set = new Set());
        return set;
    }
    LocalHide.getHiddenSet = getHiddenSet;
    function isHidden(channelId, userId, messageId) {
        return getHiddenSet(LocalHide.conversationKey(channelId, userId)).has(messageId);
    }
    LocalHide.isHidden = isHidden;
    function setSession(key, session) { sessions.set(key, session); }
    LocalHide.setSession = setSession;
    function getSession(key) { return sessions.get(key); }
    LocalHide.getSession = getSession;
    function wipeSession(session) {
        if (!session)
            return;
        if (session.key instanceof Uint8Array)
            session.key.fill(0);
        session.messages.length = 0;
    }
    function lockArchive(key) {
        wipeSession(sessions.get(key));
        sessions.delete(key);
    }
    LocalHide.lockArchive = lockArchive;
    function lockAll() {
        for (const session of sessions.values())
            wipeSession(session);
        sessions.clear();
    }
    LocalHide.lockAll = lockAll;
    async function getRecord(key) {
        return (await ensureStorage()).conversations[key];
    }
    LocalHide.getRecord = getRecord;
    async function upsertRecord(key, record) {
        const root = await ensureStorage();
        root.conversations[key] = record;
        hiddenSets.set(key, new Set(record.hiddenIds));
    }
    LocalHide.upsertRecord = upsertRecord;
    async function deleteRecord(key) {
        const root = await ensureStorage();
        delete root.conversations[key];
        hiddenSets.delete(key);
        wipeSession(sessions.get(key));
        sessions.delete(key);
    }
    LocalHide.deleteRecord = deleteRecord;
    async function totals() {
        const root = await ensureStorage();
        const records = Object.values(root.conversations);
        return { conversations: records.length, hidden: records.reduce((n, r) => n + r.hiddenIds.length, 0) };
    }
    LocalHide.totals = totals;
    function findRecordForUserSync(userId) {
        if (!initialized || !storage)
            return undefined;
        for (const [key, record] of Object.entries(storage.conversations)) {
            if (record.otherUserId === userId)
                return { key, record };
        }
        return undefined;
    }
    LocalHide.findRecordForUserSync = findRecordForUserSync;
    function isEnabledSync() {
        return !!(initialized && storage?.enabled);
    }
    LocalHide.isEnabledSync = isEnabledSync;
    function setEnabledSync(value) {
        if (storage)
            storage.enabled = value;
    }
    LocalHide.setEnabledSync = setEnabledSync;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    const VERIFIER_TEXT = "LocalHide archive verifier v1";
    function webCryptoApi() {
        const c = globalThis.crypto;
        return c?.subtle && typeof c.getRandomValues === "function" ? c : undefined;
    }
    function nativeCryptoApi() {
        try {
            const finder = bunny?.metro?.findByProps;
            if (typeof finder !== "function")
                return undefined;
            const c = finder("pbkdf2Sync", "createCipheriv", "createDecipheriv", "randomBytes");
            if (!c || typeof c.pbkdf2Sync !== "function" || typeof c.createCipheriv !== "function" || typeof c.createDecipheriv !== "function" || typeof c.randomBytes !== "function")
                return undefined;
            return c;
        }
        catch {
            return undefined;
        }
    }
    function concatBytes(parts) {
        const arrays = parts.map(part => new Uint8Array(Array.from(part)));
        const total = arrays.reduce((n, part) => n + part.length, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const part of arrays) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }
    function isNativeKey(key) {
        return key instanceof Uint8Array;
    }
    function cryptoBackendName() {
        if (webCryptoApi())
            return "WebCrypto";
        if (nativeCryptoApi())
            return "NativeCrypto";
        return "Unavailable";
    }
    LocalHide.cryptoBackendName = cryptoBackendName;
    function hasSecureCrypto() {
        return cryptoBackendName() !== "Unavailable";
    }
    LocalHide.hasSecureCrypto = hasSecureCrypto;
    function randomBytes(length) {
        const web = webCryptoApi();
        if (web) {
            const out = new Uint8Array(length);
            web.getRandomValues(out);
            return out;
        }
        const native = nativeCryptoApi();
        if (native)
            return new Uint8Array(Array.from(native.randomBytes(length)));
        throw new Error("SECURE_CRYPTO_UNAVAILABLE");
    }
    LocalHide.randomBytes = randomBytes;
    async function deriveArchiveKey(password, saltB64, iterations = LocalHide.KDF_ITERATIONS) {
        const web = webCryptoApi();
        if (web) {
            const material = await web.subtle.importKey("raw", LocalHide.utf8Encode(password), "PBKDF2", false, ["deriveKey"]);
            return web.subtle.deriveKey({ name: "PBKDF2", salt: LocalHide.base64ToBytes(saltB64), iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        }
        const native = nativeCryptoApi();
        if (native) {
            const derived = native.pbkdf2Sync(LocalHide.utf8Encode(password), LocalHide.base64ToBytes(saltB64), iterations, 32, "sha256");
            return new Uint8Array(Array.from(derived));
        }
        throw new Error("SECURE_CRYPTO_UNAVAILABLE");
    }
    LocalHide.deriveArchiveKey = deriveArchiveKey;
    async function encryptBytes(key, plaintext) {
        const iv = randomBytes(12);
        if (!isNativeKey(key)) {
            const web = webCryptoApi();
            if (!web)
                throw new Error("SECURE_CRYPTO_UNAVAILABLE");
            const encrypted = await web.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
            return { iv: LocalHide.bytesToBase64(iv), ciphertext: LocalHide.bytesToBase64(new Uint8Array(encrypted)) };
        }
        const native = nativeCryptoApi();
        if (!native)
            throw new Error("SECURE_CRYPTO_UNAVAILABLE");
        const cipher = native.createCipheriv("aes-256-gcm", key, iv);
        const encrypted = concatBytes([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
        return { iv: LocalHide.bytesToBase64(iv), ciphertext: LocalHide.bytesToBase64(encrypted) };
    }
    LocalHide.encryptBytes = encryptBytes;
    async function decryptBytes(key, blob) {
        if (!isNativeKey(key)) {
            const web = webCryptoApi();
            if (!web)
                throw new Error("SECURE_CRYPTO_UNAVAILABLE");
            const decrypted = await web.subtle.decrypt({ name: "AES-GCM", iv: LocalHide.base64ToBytes(blob.iv) }, key, LocalHide.base64ToBytes(blob.ciphertext));
            return new Uint8Array(decrypted);
        }
        const native = nativeCryptoApi();
        if (!native)
            throw new Error("SECURE_CRYPTO_UNAVAILABLE");
        const combined = LocalHide.base64ToBytes(blob.ciphertext);
        if (combined.length < 16)
            throw new Error("ARCHIVE_CORRUPTED");
        const ciphertext = combined.slice(0, -16);
        const tag = combined.slice(-16);
        const decipher = native.createDecipheriv("aes-256-gcm", key, LocalHide.base64ToBytes(blob.iv));
        decipher.setAuthTag(tag);
        return concatBytes([decipher.update(ciphertext), decipher.final()]);
    }
    LocalHide.decryptBytes = decryptBytes;
    async function encryptJson(key, value) {
        return encryptBytes(key, LocalHide.utf8Encode(JSON.stringify(value)));
    }
    LocalHide.encryptJson = encryptJson;
    async function decryptJson(key, blob) {
        const bytes = await decryptBytes(key, blob);
        return JSON.parse(LocalHide.utf8Decode(bytes));
    }
    LocalHide.decryptJson = decryptJson;
    async function makeVerifier(key) {
        return encryptBytes(key, LocalHide.utf8Encode(VERIFIER_TEXT));
    }
    LocalHide.makeVerifier = makeVerifier;
    async function verifyKey(key, blob) {
        try {
            return LocalHide.utf8Decode(await decryptBytes(key, blob)) === VERIFIER_TEXT;
        }
        catch {
            return false;
        }
    }
    LocalHide.verifyKey = verifyKey;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    function validatePassword(password) {
        if (password.length < LocalHide.PASSWORD_MIN_LENGTH) {
            throw new Error(`Password must be at least ${LocalHide.PASSWORD_MIN_LENGTH} characters`);
        }
    }
    function validateMessages(messages) {
        const seen = new Set();
        const out = [];
        for (const message of messages) {
            if (!message || !message.messageId || !message.channelId || seen.has(message.messageId))
                continue;
            seen.add(message.messageId);
            out.push(LocalHide.cloneSnapshot(message));
        }
        return LocalHide.stableSortMessages(out);
    }
    async function createArchive(identity, password, initialMessages) {
        validatePassword(password);
        if (!LocalHide.hasSecureCrypto())
            throw new Error("SECURE_CRYPTO_UNAVAILABLE");
        const keyName = LocalHide.conversationKey(identity.channelId, identity.otherUserId);
        if (await LocalHide.getRecord(keyName))
            throw new Error("ARCHIVE_ALREADY_EXISTS");
        const salt = LocalHide.bytesToBase64(LocalHide.randomBytes(16));
        const key = await LocalHide.deriveArchiveKey(password, salt);
        const messages = validateMessages(initialMessages);
        const verifier = await LocalHide.makeVerifier(key);
        const archive = await LocalHide.encryptJson(key, messages);
        const now = LocalHide.nowIso();
        const record = {
            schemaVersion: 1,
            channelId: identity.channelId,
            otherUserId: identity.otherUserId,
            displayName: identity.displayName,
            hiddenIds: LocalHide.uniqueStrings(messages.map(m => m.messageId)),
            salt,
            kdf: { name: "PBKDF2", hash: "SHA-256", iterations: LocalHide.KDF_ITERATIONS },
            verifier,
            archive,
            createdAt: now,
            updatedAt: now
        };
        await LocalHide.upsertRecord(keyName, record);
        LocalHide.setSession(keyName, { key, messages });
        return record;
    }
    LocalHide.createArchive = createArchive;
    async function unlockArchive(identityOrKey, password) {
        const keyName = typeof identityOrKey === "string"
            ? identityOrKey
            : LocalHide.conversationKey(identityOrKey.channelId, identityOrKey.otherUserId);
        const record = await LocalHide.getRecord(keyName);
        if (!record)
            throw new Error("ARCHIVE_NOT_FOUND");
        const key = await LocalHide.deriveArchiveKey(password, record.salt, record.kdf.iterations);
        if (!(await LocalHide.verifyKey(key, record.verifier)))
            throw new Error("INCORRECT_PASSWORD");
        let messages;
        try {
            messages = validateMessages(await LocalHide.decryptJson(key, record.archive));
        }
        catch {
            throw new Error("ARCHIVE_CORRUPTED");
        }
        LocalHide.setSession(keyName, { key, messages });
        return messages.slice();
    }
    LocalHide.unlockArchive = unlockArchive;
    async function hideMessages(identity, snapshots, passwordForFirstHide) {
        const keyName = LocalHide.conversationKey(identity.channelId, identity.otherUserId);
        const incoming = validateMessages(snapshots).filter(m => m.channelId === identity.channelId);
        if (!incoming.length)
            return { hiddenCount: 0, conversationKey: keyName };
        let record = await LocalHide.getRecord(keyName);
        if (!record) {
            if (!passwordForFirstHide)
                throw new Error("PASSWORD_SETUP_REQUIRED");
            record = await createArchive(identity, passwordForFirstHide, incoming);
            return { hiddenCount: incoming.length, conversationKey: keyName };
        }
        const session = LocalHide.getSession(keyName);
        if (!session)
            throw new Error("ARCHIVE_LOCKED");
        const byId = new Map(session.messages.map(m => [m.messageId, m]));
        for (const message of incoming)
            byId.set(message.messageId, LocalHide.cloneSnapshot(message));
        const merged = LocalHide.stableSortMessages(Array.from(byId.values()));
        const hiddenIds = LocalHide.uniqueStrings([...record.hiddenIds, ...incoming.map(m => m.messageId)]);
        const updated = {
            ...record,
            displayName: identity.displayName || record.displayName,
            hiddenIds,
            archive: await LocalHide.encryptJson(session.key, merged),
            updatedAt: LocalHide.nowIso()
        };
        await LocalHide.upsertRecord(keyName, updated);
        LocalHide.setSession(keyName, { key: session.key, messages: merged });
        return { hiddenCount: incoming.length, conversationKey: keyName };
    }
    LocalHide.hideMessages = hideMessages;
    async function restoreMessages(keyName, messageIds) {
        const record = await LocalHide.getRecord(keyName);
        const session = LocalHide.getSession(keyName);
        if (!record)
            throw new Error("ARCHIVE_NOT_FOUND");
        if (!session)
            throw new Error("ARCHIVE_LOCKED");
        const ids = new Set(messageIds);
        const remaining = session.messages.filter(m => !ids.has(m.messageId));
        const removed = session.messages.length - remaining.length;
        const updated = {
            ...record,
            hiddenIds: record.hiddenIds.filter(id => !ids.has(id)),
            archive: await LocalHide.encryptJson(session.key, remaining),
            updatedAt: LocalHide.nowIso()
        };
        await LocalHide.upsertRecord(keyName, updated);
        LocalHide.setSession(keyName, { key: session.key, messages: remaining });
        return removed;
    }
    LocalHide.restoreMessages = restoreMessages;
    async function restoreAll(keyName) {
        const record = await LocalHide.getRecord(keyName);
        const session = LocalHide.getSession(keyName);
        if (!record)
            throw new Error("ARCHIVE_NOT_FOUND");
        if (!session)
            throw new Error("ARCHIVE_LOCKED");
        const count = session.messages.length;
        const updated = {
            ...record,
            hiddenIds: [],
            archive: await LocalHide.encryptJson(session.key, []),
            updatedAt: LocalHide.nowIso()
        };
        await LocalHide.upsertRecord(keyName, updated);
        LocalHide.setSession(keyName, { key: session.key, messages: [] });
        return count;
    }
    LocalHide.restoreAll = restoreAll;
    async function resetArchive(keyName) {
        await LocalHide.deleteRecord(keyName);
    }
    LocalHide.resetArchive = resetArchive;
    async function archiveMetadata() {
        const root = await LocalHide.ensureStorage();
        return Object.entries(root.conversations).map(([key, r]) => ({
            key,
            channelId: r.channelId,
            userId: r.otherUserId,
            displayName: r.displayName,
            count: r.hiddenIds.length
        }));
    }
    LocalHide.archiveMetadata = archiveMetadata;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    function metro() { return bunny?.metro ?? {}; }
    function findByProps(...props) {
        try {
            return metro().findByProps?.(...props);
        }
        catch {
            return undefined;
        }
    }
    LocalHide.findByProps = findByProps;
    function findByName(name) {
        try {
            return metro().findByName?.(name, false) ?? metro().findByDisplayName?.(name);
        }
        catch {
            return undefined;
        }
    }
    LocalHide.findByName = findByName;
    function findByStoreName(name) {
        try {
            return metro().findByStoreName?.(name);
        }
        catch {
            return undefined;
        }
    }
    LocalHide.findByStoreName = findByStoreName;
    function react() {
        return bunny?.metro?.common?.React ?? globalThis.React;
    }
    LocalHide.react = react;
    function rn() {
        return bunny?.metro?.common?.ReactNative ?? findByProps("View", "Text", "Pressable", "FlatList");
    }
    LocalHide.rn = rn;
    function toasts() { return bunny?.ui?.toasts ?? {}; }
    LocalHide.toasts = toasts;
    function alerts() { return bunny?.ui?.alerts ?? {}; }
    LocalHide.alerts = alerts;
    function navigation() { return bunny?.ui?.navigation ?? {}; }
    LocalHide.navigation = navigation;
    function assets() { return bunny?.ui?.assets ?? {}; }
    LocalHide.assets = assets;
    function showToast(message) {
        try {
            const icon = assets().getAssetIDByName?.("Check") ?? assets().getAssetIDByName?.("Information");
            toasts().showToast?.(message, icon);
        }
        catch {
            LocalHide.diag(`Toast: ${message}`);
        }
    }
    LocalHide.showToast = showToast;
    function getCurrentUserId() {
        const store = findByStoreName("UserStore") ?? findByProps("getCurrentUser", "getUser");
        try {
            return store?.getCurrentUser?.()?.id;
        }
        catch {
            return undefined;
        }
    }
    LocalHide.getCurrentUserId = getCurrentUserId;
    function getChannel(channelId) {
        const store = findByStoreName("ChannelStore") ?? findByProps("getChannel", "getDMFromUserId");
        try {
            return store?.getChannel?.(channelId);
        }
        catch {
            return undefined;
        }
    }
    LocalHide.getChannel = getChannel;
    function dmIdentityFromChannel(channelId) {
        const channel = getChannel(channelId);
        if (!channel || channel.type !== 1)
            return undefined;
        const me = getCurrentUserId();
        const recipients = Array.isArray(channel.recipients) ? channel.recipients : [];
        const otherUserId = recipients.find(id => id !== me) ?? recipients[0];
        if (!otherUserId)
            return undefined;
        const userStore = findByStoreName("UserStore") ?? findByProps("getUser", "getCurrentUser");
        const user = userStore?.getUser?.(otherUserId);
        return {
            channelId,
            otherUserId,
            displayName: user?.globalName ?? user?.displayName ?? user?.username ?? otherUserId
        };
    }
    LocalHide.dmIdentityFromChannel = dmIdentityFromChannel;
    function snapshotMessage(message, identity) {
        const me = getCurrentUserId();
        const author = message?.author ?? {};
        const attachments = Array.isArray(message?.attachments) ? message.attachments.map((a) => ({
            id: LocalHide.safeString(a?.id) || undefined,
            filename: LocalHide.safeString(a?.filename, "attachment"),
            contentType: LocalHide.safeString(a?.contentType ?? a?.content_type) || undefined,
            size: typeof a?.size === "number" ? a.size : undefined,
            url: LocalHide.safeString(a?.url) || undefined,
            width: typeof a?.width === "number" ? a.width : undefined,
            height: typeof a?.height === "number" ? a.height : undefined
        })) : [];
        const ref = message?.messageReference ?? message?.message_reference;
        const referenced = message?.referencedMessage ?? message?.referenced_message;
        const reply = ref || referenced ? {
            messageId: LocalHide.safeString(ref?.messageId ?? ref?.message_id ?? referenced?.id) || undefined,
            channelId: LocalHide.safeString(ref?.channelId ?? ref?.channel_id ?? referenced?.channel_id) || undefined,
            authorId: LocalHide.safeString(referenced?.author?.id) || undefined,
            authorName: LocalHide.safeString(referenced?.author?.globalName ?? referenced?.author?.username) || undefined,
            content: LocalHide.safeString(referenced?.content) || undefined
        } : undefined;
        return {
            messageId: String(message?.id ?? ""),
            channelId: String(message?.channel_id ?? message?.channelId ?? identity.channelId),
            authorUserId: String(author?.id ?? ""),
            authorDisplayName: LocalHide.safeString(author?.globalName ?? author?.displayName ?? author?.username, "Unknown"),
            content: LocalHide.safeString(message?.content),
            timestamp: String(message?.timestamp ?? message?.editedTimestamp ?? LocalHide.nowIso()),
            authoredByMe: !!me && author?.id === me,
            attachments,
            reply
        };
    }
    LocalHide.snapshotMessage = snapshotMessage;
    function invalidateChat() {
        try {
            const dispatcher = findByProps("dispatch", "subscribe");
            dispatcher?.dispatch?.({ type: "LOCALHIDE_STATE_CHANGED", at: Date.now() });
        }
        catch { }
    }
    LocalHide.invalidateChat = invalidateChat;
    function locateMessageActionModule() {
        return findByProps("openLazy", "open") ?? findByName("MessageLongPressActionSheet") ?? findByProps("showMessageActionSheet");
    }
    LocalHide.locateMessageActionModule = locateMessageActionModule;
    function locateProfileModule() {
        return findByName("UserProfileSection") ?? findByName("UserProfileOverview") ?? findByProps("UserProfileSection");
    }
    LocalHide.locateProfileModule = locateProfileModule;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    function uiKit() {
        const R = LocalHide.react();
        const RN = LocalHide.rn();
        if (!R || !RN)
            throw new Error("REACT_NATIVE_UNAVAILABLE");
        return { R, RN };
    }
    function styles() {
        return {
            sheet: { padding: 16, gap: 12 },
            title: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
            body: { fontSize: 14, opacity: 0.8 },
            input: { borderWidth: 1, borderColor: "#555", borderRadius: 8, padding: 12, marginTop: 8 },
            button: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#5865F2", marginTop: 8 },
            danger: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#DA373C", marginTop: 8 },
            secondary: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 8, backgroundColor: "#333842", marginTop: 8 },
            miniButton: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 7, backgroundColor: "#3F4552", marginTop: 8, alignSelf: "flex-start" },
            buttonText: { color: "white", fontWeight: "700", textAlign: "center" },
            message: { padding: 12, borderRadius: 8, marginVertical: 4, backgroundColor: "#2B2D31" },
            selected: { borderWidth: 2, borderColor: "#5865F2" },
            author: { fontWeight: "700", marginBottom: 4, color: "white" },
            content: { color: "white" },
            timestamp: { fontSize: 11, opacity: 0.6, marginTop: 6, color: "white" },
            row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#444" },
            sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 12, marginBottom: 6 },
            horizontal: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }
        };
    }
    function ConfirmationSheet(props) {
        const { R, RN } = uiKit();
        const S = styles();
        const finish = (confirmed) => {
            bunny.ui.sheets.hideSheet?.("LocalHideConfirmation");
            props.onDone(confirmed);
        };
        return R.createElement(RN.View, { style: S.sheet }, R.createElement(RN.Text, { style: S.title }, props.title), R.createElement(RN.Text, { style: S.body }, props.body), R.createElement(RN.Pressable, { style: props.dangerous ? S.danger : S.button, onPress: () => finish(true) }, R.createElement(RN.Text, { style: S.buttonText }, props.confirmText)), R.createElement(RN.Pressable, { style: S.secondary, onPress: () => finish(false) }, R.createElement(RN.Text, { style: S.buttonText }, "Cancel")));
    }
    LocalHide.ConfirmationSheet = ConfirmationSheet;
    function promptConfirm(title, body, confirmText, dangerous = false) {
        return new Promise(resolve => bunny.ui.sheets.showSheet?.("LocalHideConfirmation", ConfirmationSheet, {
            title,
            body,
            confirmText,
            dangerous,
            onDone: resolve
        }));
    }
    LocalHide.promptConfirm = promptConfirm;
    function PasswordSetupSheet(props) {
        const { R, RN } = uiKit();
        const S = styles();
        const [password, setPassword] = R.useState("");
        const [confirm, setConfirm] = R.useState("");
        const [error, setError] = R.useState("");
        const finish = (value) => {
            bunny.ui.sheets.hideSheet?.("LocalHidePasswordSetup");
            props.onDone(value);
        };
        const submit = () => {
            if (password.length < LocalHide.PASSWORD_MIN_LENGTH)
                return setError(`Use at least ${LocalHide.PASSWORD_MIN_LENGTH} characters.`);
            if (password !== confirm)
                return setError("Passwords do not match.");
            finish(password);
        };
        return R.createElement(RN.View, { style: S.sheet }, R.createElement(RN.Text, { style: S.title }, "Protect Hidden Messages"), R.createElement(RN.Text, { style: S.body }, `Hidden messages for ${props.identity.displayName} are encrypted locally. This password is required to view or restore them.`), R.createElement(RN.TextInput, { style: S.input, placeholder: "Password", secureTextEntry: true, value: password, onChangeText: setPassword, autoCapitalize: "none", autoCorrect: false }), R.createElement(RN.TextInput, { style: S.input, placeholder: "Confirm password", secureTextEntry: true, value: confirm, onChangeText: setConfirm, autoCapitalize: "none", autoCorrect: false, onSubmitEditing: submit }), error ? R.createElement(RN.Text, { style: { color: "#F23F42" } }, error) : null, R.createElement(RN.Pressable, { style: S.button, onPress: submit }, R.createElement(RN.Text, { style: S.buttonText }, "Create Protected Archive")), R.createElement(RN.Pressable, { style: S.secondary, onPress: () => finish(null) }, R.createElement(RN.Text, { style: S.buttonText }, "Cancel")));
    }
    LocalHide.PasswordSetupSheet = PasswordSetupSheet;
    function PasswordUnlockSheet(props) {
        const { R, RN } = uiKit();
        const S = styles();
        const [password, setPassword] = R.useState("");
        const [error, setError] = R.useState("");
        const [busy, setBusy] = R.useState(false);
        const finish = (value) => {
            bunny.ui.sheets.hideSheet?.("LocalHidePasswordUnlock");
            props.onDone(value);
        };
        const submit = async () => {
            setBusy(true);
            setError("");
            try {
                finish(await LocalHide.unlockArchive(props.keyName, password));
            }
            catch (e) {
                const message = e.message;
                setError(message === "INCORRECT_PASSWORD" ? "Incorrect password." : message === "ARCHIVE_CORRUPTED" ? "This LocalHide archive appears corrupted." : "Could not unlock this archive.");
            }
            finally {
                setBusy(false);
            }
        };
        const reset = async () => {
            const confirmed = await promptConfirm("Reset LocalHide Archive?", `This permanently destroys the locally encrypted LocalHide archive for ${props.displayName} and removes its hidden-message filters. Discord messages are not deleted or edited.`, "Reset Archive", true);
            if (!confirmed)
                return;
            await LocalHide.resetArchive(props.keyName);
            LocalHide.invalidateChat();
            LocalHide.showToast("LocalHide archive reset");
            finish(null);
        };
        return R.createElement(RN.View, { style: S.sheet }, R.createElement(RN.Text, { style: S.title }, "View Hidden Messages"), R.createElement(RN.Text, { style: S.body }, `Enter the LocalHide password for ${props.displayName}. There is no password recovery.`), R.createElement(RN.TextInput, { style: S.input, placeholder: "Password", secureTextEntry: true, value: password, onChangeText: setPassword, autoCapitalize: "none", autoCorrect: false, onSubmitEditing: submit }), error ? R.createElement(RN.Text, { style: { color: "#F23F42" } }, error) : null, R.createElement(RN.Pressable, { style: S.button, disabled: busy, onPress: submit }, R.createElement(RN.Text, { style: S.buttonText }, busy ? "Unlocking…" : "Unlock")), R.createElement(RN.Pressable, { style: S.secondary, onPress: () => finish(null) }, R.createElement(RN.Text, { style: S.buttonText }, "Cancel")), R.createElement(RN.Pressable, { style: S.danger, disabled: busy, onPress: reset }, R.createElement(RN.Text, { style: S.buttonText }, "Reset LocalHide Archive")));
    }
    LocalHide.PasswordUnlockSheet = PasswordUnlockSheet;
    function ArchiveSheet(props) {
        const { R, RN } = uiKit();
        const S = styles();
        const [, rerender] = R.useReducer((x) => x + 1, 0);
        const [selected, setSelected] = R.useState(() => new Set());
        const session = LocalHide.getSession(props.keyName);
        const messages = session?.messages ?? [];
        R.useEffect(() => () => LocalHide.lockArchive(props.keyName), []);
        const toggle = (id) => {
            const next = new Set(selected);
            next.has(id) ? next.delete(id) : next.add(id);
            setSelected(next);
        };
        const restoreOne = async (id) => {
            await LocalHide.restoreMessages(props.keyName, [id]);
            const next = new Set(selected);
            next.delete(id);
            setSelected(next);
            rerender();
            LocalHide.invalidateChat();
            LocalHide.showToast("Restored message locally");
        };
        const restoreSelected = async () => {
            if (!selected.size)
                return;
            await LocalHide.restoreMessages(props.keyName, selected);
            setSelected(new Set());
            rerender();
            LocalHide.invalidateChat();
            LocalHide.showToast("Restored locally hidden messages");
        };
        const restoreAllNow = async () => {
            const confirmed = await promptConfirm("Restore All Hidden Messages?", "All LocalHide filters and encrypted snapshots for this conversation will be removed from the hidden archive. Discord itself is not modified.", "Restore All");
            if (!confirmed)
                return;
            await LocalHide.restoreAll(props.keyName);
            setSelected(new Set());
            rerender();
            LocalHide.invalidateChat();
            LocalHide.showToast("Restored all hidden messages");
        };
        const renderItem = ({ item }) => R.createElement(RN.Pressable, { style: [S.message, selected.has(item.messageId) ? S.selected : null], onPress: () => toggle(item.messageId) }, R.createElement(RN.Text, { style: S.author }, item.authoredByMe ? "You" : item.authorDisplayName), R.createElement(RN.Text, { style: S.content }, item.content || (item.attachments.length ? `[${item.attachments.length} attachment${item.attachments.length === 1 ? "" : "s"}]` : "(empty message)")), item.reply?.messageId ? R.createElement(RN.Text, { style: S.body }, `Reply to ${item.reply.authorName ?? item.reply.messageId}`) : null, item.attachments.map((a, i) => R.createElement(RN.Text, { key: `${item.messageId}:a:${i}`, style: S.body }, `Attachment: ${a.filename}${a.contentType ? ` · ${a.contentType}` : ""}${typeof a.size === "number" ? ` · ${a.size} bytes` : ""}`)), R.createElement(RN.Text, { style: S.timestamp }, new Date(item.timestamp).toLocaleString()), R.createElement(RN.Pressable, { style: S.miniButton, onPress: () => restoreOne(item.messageId) }, R.createElement(RN.Text, { style: S.buttonText }, "Restore")));
        return R.createElement(RN.View, { style: { flex: 1, padding: 12 } }, R.createElement(RN.Text, { style: S.title }, `LocalHide · ${props.displayName}`), R.createElement(RN.Text, { style: S.body }, `${messages.length} hidden message${messages.length === 1 ? "" : "s"}. Tap messages to select them for bulk restore.`), R.createElement(RN.FlatList, { data: messages, keyExtractor: (m) => m.messageId, renderItem, style: { flex: 1, marginTop: 8 }, initialNumToRender: 20, windowSize: 7, removeClippedSubviews: true }), selected.size ? R.createElement(RN.Pressable, { style: S.button, onPress: restoreSelected }, R.createElement(RN.Text, { style: S.buttonText }, `Restore ${selected.size} Selected`)) : null, messages.length ? R.createElement(RN.Pressable, { style: S.danger, onPress: restoreAllNow }, R.createElement(RN.Text, { style: S.buttonText }, "Restore All Hidden Messages")) : null);
    }
    LocalHide.ArchiveSheet = ArchiveSheet;
    function BulkSelectSheet(props) {
        const { R, RN } = uiKit();
        const S = styles();
        const [selected, setSelected] = R.useState(() => new Set());
        const snapshots = props.messages.map(m => LocalHide.snapshotMessage(m, props.identity)).filter(m => m.messageId);
        const toggle = (id) => {
            const next = new Set(selected);
            next.has(id) ? next.delete(id) : next.add(id);
            setSelected(next);
        };
        const confirm = async () => {
            const chosen = snapshots.filter(m => selected.has(m.messageId));
            if (!chosen.length)
                return;
            await hideWithPasswordFlow(props.identity, chosen);
            bunny.ui.sheets.hideSheet?.("LocalHideBulkSelect");
        };
        const renderItem = ({ item }) => R.createElement(RN.Pressable, { style: [S.message, selected.has(item.messageId) ? S.selected : null], onPress: () => toggle(item.messageId) }, R.createElement(RN.Text, { style: S.author }, item.authoredByMe ? "You" : item.authorDisplayName), R.createElement(RN.Text, { style: S.content, numberOfLines: 3 }, item.content || "(non-text message)"));
        return R.createElement(RN.View, { style: { flex: 1, padding: 12 } }, R.createElement(RN.Text, { style: S.title }, "Select Messages"), R.createElement(RN.Text, { style: S.body }, `${selected.size} selected · currently loaded messages in this DM`), R.createElement(RN.FlatList, { data: snapshots, keyExtractor: (m) => m.messageId, renderItem, style: { flex: 1 }, initialNumToRender: 30, windowSize: 7 }), R.createElement(RN.Pressable, { style: S.button, disabled: selected.size === 0, onPress: confirm }, R.createElement(RN.Text, { style: S.buttonText }, `Hide ${selected.size} Message${selected.size === 1 ? "" : "s"}`)), R.createElement(RN.Pressable, { style: S.secondary, onPress: () => bunny.ui.sheets.hideSheet?.("LocalHideBulkSelect") }, R.createElement(RN.Text, { style: S.buttonText }, "Cancel")));
    }
    LocalHide.BulkSelectSheet = BulkSelectSheet;
    function ProtectedConversationsSheet() {
        const { R, RN } = uiKit();
        const S = styles();
        const [items, setItems] = R.useState([]);
        const refresh = () => LocalHide.archiveMetadata().then(setItems);
        R.useEffect(() => { void refresh(); }, []);
        const resetOne = async (item) => {
            const confirmed = await promptConfirm("Reset LocalHide Archive?", `Destroy the encrypted LocalHide archive for ${item.displayName} and unhide its locally filtered messages? Discord is not modified.`, "Reset Archive", true);
            if (!confirmed)
                return;
            await LocalHide.resetArchive(item.key);
            await refresh();
            LocalHide.invalidateChat();
            LocalHide.showToast("LocalHide archive reset");
        };
        const renderItem = ({ item }) => R.createElement(RN.View, { style: S.row }, R.createElement(RN.Text, { style: S.author }, item.displayName), R.createElement(RN.Text, { style: S.body }, `${item.count} hidden message${item.count === 1 ? "" : "s"}`), R.createElement(RN.View, { style: S.horizontal }, R.createElement(RN.Pressable, { style: S.miniButton, onPress: () => showArchive(item.key, item.displayName) }, R.createElement(RN.Text, { style: S.buttonText }, "View")), R.createElement(RN.Pressable, { style: [S.miniButton, { backgroundColor: "#DA373C" }], onPress: () => resetOne(item) }, R.createElement(RN.Text, { style: S.buttonText }, "Reset"))));
        return R.createElement(RN.View, { style: { flex: 1, padding: 12 } }, R.createElement(RN.Text, { style: S.title }, "Protected Conversations"), R.createElement(RN.Text, { style: S.body }, "LocalHide uses Discord IDs internally, so display-name changes do not break archives."), items.length
            ? R.createElement(RN.FlatList, { data: items, keyExtractor: (item) => item.key, renderItem, style: { flex: 1, marginTop: 8 } })
            : R.createElement(RN.Text, { style: S.body }, "No protected conversations yet."), R.createElement(RN.Pressable, { style: S.secondary, onPress: () => bunny.ui.sheets.hideSheet?.("LocalHideProtectedConversations") }, R.createElement(RN.Text, { style: S.buttonText }, "Close")));
    }
    LocalHide.ProtectedConversationsSheet = ProtectedConversationsSheet;
    function promptPasswordSetup(identity) {
        return new Promise(resolve => bunny.ui.sheets.showSheet?.("LocalHidePasswordSetup", PasswordSetupSheet, { identity, onDone: resolve }));
    }
    LocalHide.promptPasswordSetup = promptPasswordSetup;
    function promptUnlock(keyName, displayName) {
        return new Promise(resolve => bunny.ui.sheets.showSheet?.("LocalHidePasswordUnlock", PasswordUnlockSheet, { keyName, displayName, onDone: resolve }));
    }
    LocalHide.promptUnlock = promptUnlock;
    async function showArchive(keyName, displayName) {
        if (!LocalHide.getSession(keyName)) {
            const unlocked = await promptUnlock(keyName, displayName);
            if (!unlocked)
                return;
        }
        LocalHide.compatibility.navigation = true;
        bunny.ui.sheets.showSheet?.("LocalHideArchive", ArchiveSheet, { keyName, displayName });
    }
    LocalHide.showArchive = showArchive;
    async function hideWithPasswordFlow(identity, snapshots) {
        const keyName = LocalHide.conversationKey(identity.channelId, identity.otherUserId);
        const existing = await LocalHide.getRecord(keyName);
        try {
            if (!existing) {
                const password = await promptPasswordSetup(identity);
                if (!password)
                    return;
                await LocalHide.hideMessages(identity, snapshots, password);
            }
            else if (!LocalHide.getSession(keyName)) {
                const unlocked = await promptUnlock(keyName, existing.displayName);
                if (!unlocked)
                    return;
                await LocalHide.hideMessages(identity, snapshots);
            }
            else {
                await LocalHide.hideMessages(identity, snapshots);
            }
            LocalHide.invalidateChat();
            LocalHide.showToast(snapshots.length === 1 ? "Message hidden locally" : `${snapshots.length} messages hidden locally`);
        }
        catch (e) {
            const message = e.message;
            LocalHide.showToast(message === "SECURE_CRYPTO_UNAVAILABLE" ? "LocalHide: secure crypto unavailable" : `LocalHide error: ${message}`);
            LocalHide.diag(`Hide failed: ${message}`);
        }
    }
    LocalHide.hideWithPasswordFlow = hideWithPasswordFlow;
    function SettingsComponent() {
        const { R, RN } = uiKit();
        const S = styles();
        const [info, setInfo] = R.useState({ conversations: 0, hidden: 0 });
        const [enabled, setEnabled] = R.useState(LocalHide.isEnabledSync());
        const refresh = () => LocalHide.totals().then(setInfo);
        R.useEffect(() => { void refresh(); }, []);
        const toggleEnabled = (value) => {
            setEnabled(value);
            LocalHide.setEnabledSync(value);
            LocalHide.invalidateChat();
        };
        const manage = () => bunny.ui.sheets.showSheet?.("LocalHideProtectedConversations", ProtectedConversationsSheet, {});
        return R.createElement(RN.ScrollView, { style: { flex: 1 }, contentContainerStyle: S.sheet }, R.createElement(RN.Text, { style: S.title }, "LocalHide"), R.createElement(RN.Text, { style: S.body }, "Locally hide and protect messages in one-to-one DMs. No Discord mutation requests are sent."), R.createElement(RN.View, { style: S.row }, R.createElement(RN.Text, null, "Plugin enabled"), R.createElement(RN.Switch, { value: enabled, onValueChange: toggleEnabled })), R.createElement(RN.Text, { style: S.row }, `Protected conversations: ${info.conversations}`), R.createElement(RN.Text, { style: S.row }, `Locally hidden messages: ${info.hidden}`), R.createElement(RN.Pressable, { style: S.button, onPress: manage }, R.createElement(RN.Text, { style: S.buttonText }, "Manage Protected Conversations")), R.createElement(RN.Text, { style: S.sectionTitle }, "Compatibility"), R.createElement(RN.Text, { style: S.body }, `Message filter: ${LocalHide.compatibility.messageFilter ? "ready" : "not found"}\nMessage actions: ${LocalHide.compatibility.messageActions ? "ready" : "not found"}\nProfile panel: ${LocalHide.compatibility.profilePanel ? "ready" : "not found"}\nSecure crypto: ${LocalHide.compatibility.crypto ? "available" : "unavailable"}`), LocalHide.compatibility.diagnostics.length ? R.createElement(RN.Text, { style: S.body }, LocalHide.compatibility.diagnostics.slice(-8).join("\n")) : null, R.createElement(RN.Text, { style: S.sectionTitle }, "About LocalHide"), R.createElement(RN.Text, { style: S.body }, `Version ${LocalHide.PLUGIN_VERSION}. Targeted at Discord/Kettu 305.1. Crypto backend: ${LocalHide.cryptoBackendName()}. Hidden content uses PBKDF2-SHA-256 + AES-256-GCM with a trusted runtime crypto backend.`));
    }
    LocalHide.SettingsComponent = SettingsComponent;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    function messageIdOf(value) {
        const id = value?.message?.id ?? value?.id ?? value?.messageId ?? value?.message_id;
        return id == null ? undefined : String(id);
    }
    function channelIdOf(value) {
        const id = value?.message?.channel_id ?? value?.message?.channelId ?? value?.channelId ?? value?.channel_id;
        return id == null ? undefined : String(id);
    }
    function filterArrayForDm(values, identity) {
        const hidden = LocalHide.getHiddenSet(LocalHide.conversationKey(identity.channelId, identity.otherUserId));
        if (!hidden.size)
            return values;
        return values.filter(item => {
            const id = messageIdOf(item);
            return !id || !hidden.has(id);
        });
    }
    function filteredProps(props) {
        if (!props || typeof props !== "object" || !LocalHide.isEnabledSync())
            return props;
        const channelId = String(props.channelId ?? props.channel?.id ?? props.message?.channel_id ?? "");
        if (!channelId)
            return props;
        const identity = LocalHide.dmIdentityFromChannel(channelId);
        if (!identity)
            return props;
        let changed = false;
        const clone = { ...props };
        for (const key of ["messages", "items", "rows", "data"]) {
            if (Array.isArray(props[key])) {
                const next = filterArrayForDm(props[key], identity);
                if (next.length !== props[key].length) {
                    clone[key] = next;
                    changed = true;
                }
            }
        }
        return changed ? clone : props;
    }
    function patchComponent(module, method, label) {
        if (!module || typeof module[method] !== "function")
            return false;
        bunny.api.patcher.before(method, module, (args) => {
            if (args[0] && typeof args[0] === "object")
                args[0] = filteredProps(args[0]);
        });
        LocalHide.diag(`Message filter attached to ${label}.${method}`);
        return true;
    }
    function installMessageFilterPatch() {
        let installed = false;
        const candidates = [
            [LocalHide.findByName("ChatView"), "default", "ChatView"],
            [LocalHide.findByName("MessageList"), "default", "MessageList"],
            [LocalHide.findByName("MessageListView"), "default", "MessageListView"],
            [LocalHide.findByName("RowGenerator"), "default", "RowGenerator"]
        ];
        for (const [mod, method, label] of candidates) {
            try {
                installed = patchComponent(mod, method, label) || installed;
            }
            catch (e) {
                LocalHide.diag(`Filter patch ${label} failed: ${e.message}`);
            }
        }
        if (!installed) {
            const rowModule = LocalHide.findByProps("generateRows", "getRows") ?? LocalHide.findByProps("getRows");
            for (const method of ["generateRows", "getRows"]) {
                if (!rowModule || typeof rowModule[method] !== "function")
                    continue;
                bunny.api.patcher.after(method, rowModule, (args, ret) => {
                    if (!Array.isArray(ret) || !LocalHide.isEnabledSync())
                        return ret;
                    const channelId = String(args?.[0]?.channelId ?? args?.[0]?.channel?.id ?? "");
                    const identity = channelId ? LocalHide.dmIdentityFromChannel(channelId) : undefined;
                    return identity ? filterArrayForDm(ret, identity) : ret;
                });
                installed = true;
                LocalHide.diag(`Message filter attached to row generator ${method}`);
                break;
            }
        }
        LocalHide.compatibility.messageFilter = installed;
        if (!installed)
            LocalHide.diag("No compatible rendered-message list interception point found on this build");
        return installed;
    }
    LocalHide.installMessageFilterPatch = installMessageFilterPatch;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    function loadedMessages(channelId) {
        const store = LocalHide.findByStoreName("MessageStore") ?? LocalHide.findByProps("getMessages", "getMessage");
        try {
            const collection = store?.getMessages?.(channelId);
            if (Array.isArray(collection))
                return collection;
            if (typeof collection?.toArray === "function")
                return collection.toArray();
            if (Array.isArray(collection?._array))
                return collection._array;
            if (Array.isArray(collection?._messages))
                return collection._messages;
            if (collection && typeof collection === "object")
                return Object.values(collection).filter((v) => v?.id);
        }
        catch (e) {
            LocalHide.diag(`Could not read loaded messages: ${e.message}`);
        }
        return [];
    }
    function LocalHideActionBlock(props) {
        const R = LocalHide.react();
        const RN = LocalHide.rn();
        if (!R || !RN || !props?.message || !LocalHide.isEnabledSync())
            return null;
        const channelId = String(props.channelId ?? props.message.channel_id ?? props.message.channelId ?? "");
        const identity = channelId ? LocalHide.dmIdentityFromChannel(channelId) : undefined;
        if (!identity)
            return null;
        const base = { paddingVertical: 13, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: "#3F4147" };
        const text = { color: "white", fontSize: 16, fontWeight: "600" };
        const hideOne = async () => {
            try {
                bunny.ui.sheets.hideSheet?.(props.sheetKey ?? "MessageLongPressActionSheet");
            }
            catch { }
            await LocalHide.hideWithPasswordFlow(identity, [LocalHide.snapshotMessage(props.message, identity)]);
        };
        const selectMany = () => {
            try {
                bunny.ui.sheets.hideSheet?.(props.sheetKey ?? "MessageLongPressActionSheet");
            }
            catch { }
            const hidden = LocalHide.getHiddenSet(LocalHide.conversationKey(identity.channelId, identity.otherUserId));
            const messages = loadedMessages(channelId).filter(message => !hidden.has(String(message?.id ?? "")));
            bunny.ui.sheets.showSheet?.("LocalHideBulkSelect", LocalHide.BulkSelectSheet, { identity, messages });
        };
        return R.createElement(RN.View, null, R.createElement(RN.Pressable, { style: base, onPress: hideOne }, R.createElement(RN.Text, { style: text }, "Hide Locally")), R.createElement(RN.Pressable, { style: base, onPress: selectMany }, R.createElement(RN.Text, { style: text }, "Select Messages")));
    }
    LocalHide.LocalHideActionBlock = LocalHideActionBlock;
    function appendActionBlock(element, messageProps, sheetKey) {
        const R = LocalHide.react();
        if (!R?.isValidElement?.(element))
            return element;
        const block = R.createElement(LocalHideActionBlock, { message: messageProps.message, channelId: messageProps.channelId, sheetKey });
        const existing = element.props?.children;
        const children = Array.isArray(existing) ? [...existing, block] : [existing, block].filter(Boolean);
        return R.cloneElement(element, { ...element.props }, ...children);
    }
    function installMessageActionsPatch() {
        const actionSheet = LocalHide.findByProps("openLazy", "hideActionSheet");
        if (!actionSheet?.openLazy) {
            LocalHide.compatibility.messageActions = false;
            LocalHide.diag("Message action-sheet openLazy module not found");
            return false;
        }
        bunny.api.patcher.before("openLazy", actionSheet, (args) => {
            const key = String(args[1] ?? "");
            const props = args[2];
            if (!LocalHide.isEnabledSync() || !props?.message || !/Message.*(LongPress|ActionSheet)|MessageLongPressActionSheet/i.test(key))
                return;
            const channelId = String(props.channelId ?? props.message.channel_id ?? props.message.channelId ?? "");
            if (!LocalHide.dmIdentityFromChannel(channelId))
                return;
            const lazy = args[0];
            try {
                args[0] = Promise.resolve(lazy).then((mod) => {
                    const Original = mod?.default ?? mod;
                    if (typeof Original !== "function")
                        return mod;
                    const Wrapped = (componentProps) => appendActionBlock(Original(componentProps), props, key);
                    try {
                        Object.defineProperty(Wrapped, "name", { value: "LocalHideMessageActionSheet" });
                    }
                    catch { }
                    return { ...(mod && typeof mod === "object" ? mod : {}), default: Wrapped };
                });
            }
            catch (e) {
                LocalHide.diag(`Message action wrapping failed: ${e.message}`);
            }
        });
        LocalHide.compatibility.messageActions = true;
        LocalHide.diag("Message action-sheet hook installed through openLazy");
        return true;
    }
    LocalHide.installMessageActionsPatch = installMessageActionsPatch;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    function extractProfileUserId(props) {
        const id = props?.user?.id ?? props?.userId ?? props?.profile?.user?.id ?? props?.profile?.id;
        return id == null ? undefined : String(id);
    }
    function LocalHideProfilePanel(props) {
        const R = LocalHide.react();
        const RN = LocalHide.rn();
        const match = LocalHide.findRecordForUserSync(props.userId);
        if (!R || !RN || !LocalHide.isEnabledSync() || !match || !match.record.hiddenIds.length)
            return null;
        const row = { marginHorizontal: 16, marginVertical: 8, padding: 14, borderRadius: 10, backgroundColor: "#2B2D31" };
        return R.createElement(RN.Pressable, { style: row, onPress: () => LocalHide.showArchive(match.key, match.record.displayName) }, R.createElement(RN.Text, { style: { color: "white", fontWeight: "700", fontSize: 16 } }, "LocalHide"), R.createElement(RN.Text, { style: { color: "white", opacity: 0.75, marginTop: 4 } }, `${match.record.hiddenIds.length} hidden message${match.record.hiddenIds.length === 1 ? "" : "s"}`), R.createElement(RN.Text, { style: { color: "#A9B5F7", fontWeight: "600", marginTop: 8 } }, "View Hidden Messages"));
    }
    LocalHide.LocalHideProfilePanel = LocalHideProfilePanel;
    function appendPanel(ret, props) {
        const R = LocalHide.react();
        const userId = extractProfileUserId(props);
        if (!LocalHide.isEnabledSync() || !userId || !LocalHide.findRecordForUserSync(userId) || !R?.isValidElement?.(ret))
            return ret;
        const panel = R.createElement(LocalHideProfilePanel, { userId });
        const children = ret.props?.children;
        return R.cloneElement(ret, { ...ret.props }, ...(Array.isArray(children) ? [...children, panel] : [children, panel].filter(Boolean)));
    }
    function installProfilePatch() {
        const candidates = [LocalHide.findByName("UserProfileSection"), LocalHide.findByName("UserProfileOverview"), LocalHide.locateProfileModule()].filter(Boolean);
        for (const mod of candidates) {
            for (const method of ["default", "UserProfileSection", "render"]) {
                if (typeof mod?.[method] !== "function")
                    continue;
                try {
                    bunny.api.patcher.after(method, mod, (args, ret) => appendPanel(ret, args[0]));
                    LocalHide.compatibility.profilePanel = true;
                    LocalHide.diag(`Profile panel hook installed on ${method}`);
                    return true;
                }
                catch (e) {
                    LocalHide.diag(`Profile patch candidate failed: ${e.message}`);
                }
            }
        }
        LocalHide.compatibility.profilePanel = false;
        LocalHide.diag("No compatible user-profile render module found on this build");
        return false;
    }
    LocalHide.installProfilePatch = installProfilePatch;
})(LocalHide || (LocalHide = {}));
var LocalHide;
(function (LocalHide) {
    let started = false;
    async function bootstrap() {
        try {
            await LocalHide.ensureStorage();
            LocalHide.compatibility.crypto = LocalHide.hasSecureCrypto();
            LocalHide.diag(`Crypto backend: ${LocalHide.cryptoBackendName()}`);
            if (!LocalHide.compatibility.crypto)
                LocalHide.diag("No trusted WebCrypto or native crypto backend found; protected archive operations are disabled");
            LocalHide.installMessageFilterPatch();
            LocalHide.installMessageActionsPatch();
            LocalHide.installProfilePatch();
            LocalHide.diag("LocalHide bootstrap complete");
        }
        catch (e) {
            LocalHide.diag(`Bootstrap failed: ${e.message}`);
            LocalHide.showToast(`LocalHide failed to start: ${e.message}`);
        }
    }
    LocalHide.plugin = {
        start() {
            if (started)
                return;
            started = true;
            void bootstrap();
        },
        stop() {
            started = false;
            LocalHide.lockAll();
            LocalHide.compatibility.messageFilter = false;
            LocalHide.compatibility.messageActions = false;
            LocalHide.compatibility.profilePanel = false;
            LocalHide.compatibility.navigation = false;
        },
        SettingsComponent: LocalHide.SettingsComponent
    };
})(LocalHide || (LocalHide = {}));

var plugin = { default: definePlugin(LocalHide.plugin) };
