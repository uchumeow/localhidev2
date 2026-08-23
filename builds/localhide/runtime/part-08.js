d));
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
    