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

return {
  onLoad: function () { return LocalHide.plugin.start(); },
  onUnload: function () { return LocalHide.plugin.stop(); },
  settings: LocalHide.SettingsComponent
};
})()