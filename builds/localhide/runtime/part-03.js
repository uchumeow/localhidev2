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
            authorDisplayName: LocalHide.safeString(author?.globalName ?? author?.displayName ?? author?.username, "Unknow