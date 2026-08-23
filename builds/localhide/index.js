(function () {
  "use strict";
  var parts = ["runtime/part-00.js", "runtime/part-01.js", "runtime/part-02.js", "runtime/part-03.js", "runtime/part-04.js", "runtime/part-05.js", "runtime/part-06.js", "runtime/part-07.js", "runtime/part-08.js", "runtime/part-09.js"];
  var inner = null;
  var loading = null;

  function toast(message) {
    try { vendetta.ui.toasts.showToast(message); }
    catch (e) { try { console.log(message); } catch (_) {} }
  }

  function errText(error) {
    try {
      if (error && error.message) return String(error.message);
      return String(error);
    } catch (_) {
      return "unknown error";
    }
  }

  async function fetchPart(baseUrl, part) {
    var lastError = null;
    for (var attempt = 1; attempt <= 3; attempt++) {
      try {
        var response = await vendetta.utils.safeFetch(baseUrl + part, { cache: "no-store" }, 30000);
        return await response.text();
      } catch (error) {
        lastError = error;
        try { console.warn("[LocalHide] " + part + " attempt " + attempt + " failed", error); } catch (_) {}
      }
    }
    throw new Error(part + ": " + errText(lastError));
  }

  async function loadInner() {
    if (inner) return inner;
    if (loading) return loading;
    loading = (async function () {
      var baseUrl = vendetta.plugin.id;
      if (!baseUrl.endsWith("/")) baseUrl += "/";

      var texts = [];
      for (var i = 0; i < parts.length; i++) {
        texts.push(await fetchPart(baseUrl, parts[i]));
      }

      var source = texts.join("");
      var raw;
      try {
        raw = (0, eval)("vendetta=>{return " + source + "}\n//# sourceURL=" + baseUrl + "runtime.js")(vendetta);
      } catch (error) {
        throw new Error("eval: " + errText(error));
      }

      try {
        inner = typeof raw === "function" ? raw() : raw;
        inner = inner && inner.default ? inner.default : (inner || {});
      } catch (error) {
        throw new Error("init: " + errText(error));
      }
      return inner;
    })();

    try { return await loading; }
    finally { loading = null; }
  }

  return {
    onLoad: function () {
      void loadInner()
        .then(function (plugin) {
          if (plugin && plugin.onLoad) {
            try {
              var result = plugin.onLoad();
              if (result && typeof result.catch === "function") {
                return result.catch(function (error) {
                  throw new Error("startup: " + errText(error));
                });
              }
              return result;
            } catch (error) {
              throw new Error("startup: " + errText(error));
            }
          }
        })
        .catch(function (error) {
          var detail = errText(error);
          try { console.error("[LocalHide] runtime load failed: " + detail, error); } catch (_) {}
          toast("LocalHide error: " + detail);
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