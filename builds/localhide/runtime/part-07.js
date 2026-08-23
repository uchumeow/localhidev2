tibility.profilePanel ? "ready" : "not found"}\nSecure crypto: ${LocalHide.compatibility.crypto ? "available" : "unavailable"}`), LocalHide.compatibility.diagnostics.length ? R.createElement(RN.Text, { style: S.body }, LocalHide.compatibility.diagnostics.slice(-8).join("\n")) : null, R.createElement(RN.Text, { style: S.sectionTitle }, "About LocalHide"), R.createElement(RN.Text, { style: S.body }, `Version ${LocalHide.PLUGIN_VERSION}. Targeted at Discord/Kettu 305.1. Crypto backend: ${LocalHide.cryptoBackendName()}. Hidden content uses PBKDF2-SHA-256 + AES-256-GCM with a trusted runtime crypto backend.`));
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
            const hidden = LocalHide.getHiddenSet(LocalHide.conversationKey(identity.channelId, identity.otherUserI