n"),
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
          