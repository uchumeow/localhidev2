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
        return R.createElement(RN.View, { style: { flex: 1, padding: 12 } }, R.createElement(RN.Text, { style: S.title }, "Select Messages"), R.createElement(RN.Text, { style: S.body }, `${selected.size} selected · currently loaded messages 