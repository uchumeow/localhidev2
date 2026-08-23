function decryptBytes(key, blob) {
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
    