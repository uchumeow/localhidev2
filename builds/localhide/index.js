(function () {
  "use strict";
  var parts = ["runtime/part-00.js", "runtime/part-01.js", "runtime/part-02.js", "runtime/part-03.js", "runtime/part-04.js", "runtime/part-05.js", "runtime/part-06.js", "runtime/part-07.js", "runtime/part-08.js", "runtime/part-09.js"];
  var inner = null;
  var loading = null;

  function toast(message) {
    try { vendetta.ui.toasts.showToast(message); }
    catch (e) { try { console.log(message); } catch (_) {} }
  }

  async function loadInner() {
    if (inner) return inner;
    if (loading) return loading;
    loading = (async function () {
      var baseUrl = vendetta.plugin.id;
      if (!baseUrl.endsWith("/")) baseUrl += "/";
      var texts = await Promise.all(parts.map(async function (part) {
        var response = await vendetta.utils.safeFetch(baseUrl + part, { cache: "no-store" }, 20000);
        return await response.text();
      }));
      var source = texts.join("");
      var raw = (0, eval)("vendetta=>{return " + source + "}\n//# sourceURL=" + baseUrl + "runtime.js")(vendetta);
      inner = typeof raw === "function" ? raw() : raw;
      inner = inner && inner.default ? inner.default : (inner || {});
      return inner;
    })();
    try { return await loading; }
    finally { loading = null; }
  }

  return {
    onLoad: function () {
      void loadInner()
        .then(function (plugin) { if (plugin && plugin.onLoad) return plugin.onLoad(); })
        .catch(function (error) {
          try { console.error("[LocalHide] runtime load failed", error); } catch (_) {}
          toast("LocalHide runtime failed to load");
        });
    },
    onUnload: function () {
      if (inner && inner.onUnload) return inner.onUnload();
    },
    settings: function LocalHideLoaderSettings() {
      var React = vendetta.metro.common.React;
      var RN = vendetta.metro.common.ReactNative;
      if (inner && inner.settings) return React.createElement(inner.settings);
      return React.createElement(
        RN.View,
        { style: { padding: 16 } },
        React.createElement(RN.Text, null, "LocalHide is loading…")
      );
    }
  };
})()