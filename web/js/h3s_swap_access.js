// Character Swap entry point for the modern timeline workspace.
// Reuses the same experimental swap setup as the classic v6 workspace.
import { installSwap } from "./v6/swap.js";
import { T } from "./h3s_i18n.js";
import { V6_CSS, applyScheme, schemeSetting } from "./v6/css.js";

export function installSwapAccess(Editor, { C, h, ICON }) {
  let faceInstalled = false;
  const ensureV6Style = () => {
    if (document.getElementById("h3l-v6-style")) return;
    const style = document.createElement("style");
    style.id = "h3l-v6-style";
    style.textContent = V6_CSS;
    document.head.appendChild(style);
  };
  // Avoid importing v6/kit here: that module imports H3Editor back and would
  // read uninitialized exports while the modern editor is being registered.
  const I = { upload: ICON.upload, spark: ICON.spark };
  const btn = ({ icon, label, kind = "tinted", onclick }) => h("button", {
    class: "v6-b is-" + kind, type: "button", onclick,
  }, icon ? h("span", { class: "v6-ic", html: icon }) : null, label);
  installSwap(Editor, { C, h, I, btn });

  Object.assign(Editor.prototype, {
    openSwapWorkspace() {
      if (!this.root) return;
      // Mirror normal rail navigation: close floating settings/help before
      // presenting the full-screen Swap setup.
      if (this.$.setWin) { this.$.setWin.remove(); this.$.setWin = null; }
      this.helpHide?.();
      this.galClose?.();
      ensureV6Style();
      if (!this.$.swapHost) {
        this._swapPreviousPage = this.page;
        this._swapV6WasEnabled = "v6" in document.documentElement.dataset;
        document.documentElement.dataset.v6 = "";
        applyScheme(schemeSetting(), false);
        this.$.pSwap = h("main", {
          class: "v6-page v6-swap",
          style: { top: "48px" },
        });
        this.$.swapHost = h("div", {
          class: "v6 h3l-swap-host",
          dataset: { page: "swap" },
          style: {
            position: "absolute", top: "66px", right: "10px", bottom: "10px",
            left: "70px", zIndex: "30", overflow: "hidden",
            borderRadius: "12px", background: "var(--v6-bg)",
            border: "1px solid var(--v6-hl)",
          },
        },
          h("div", {
            style: {
              height: "48px", display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "0 18px",
              borderBottom: "1px solid var(--v6-hl)",
            },
          },
            h("strong", null, T("Замена персонажа · эксперимент")),
            h("button", { class: "v6-b is-tinted", type: "button",
              onclick: () => this.closeSwapWorkspace() }, T("← Вернуться в монтаж"))),
          this.$.pSwap);
        this.root.append(this.$.swapHost);
      }
      this.page = "swap";
      this.tool = "swap";
      this.renderTools();
      this.renderSwap();
    },

    closeSwapWorkspace(render = true) {
      this.$.swapHost?.remove();
      this.$.swapHost = null;
      this.$.pSwap = null;
      if (!this._swapV6WasEnabled) delete document.documentElement.dataset.v6;
      this.page = this._swapPreviousPage;
      if (this.tool === "swap") this.tool = "assets";
      if (render && this.root) { this.renderTools(); this.renderLeft(); }
    },

    /** Face refinement is available from the modern Swap clip quick actions. */
    async openSwapFaceRefine(i) {
      if (!this.root || !this.p.segments[i]?.source?.swap) return;
      try {
        if (!faceInstalled) {
          // Lazy import avoids v6/kit -> h3s_editor circular initialization.
          const { installFace } = await import("./v6/face.js");
          installFace(Editor, { C, h });
          faceInstalled = true;
        }
        const state = this.faceState(i);
        if (!state.ok) return this.toast(state.why, true);
        ensureV6Style();
        const de = document.documentElement;
        this._faceV6WasEnabled = "v6" in de.dataset;
        de.dataset.v6 = "";
        applyScheme(schemeSetting(), false);
        this.$.faceMount = h("div", { class: "v6 h3l-face-host",
          style: { position: "absolute", inset: "0", zIndex: "90" } });
        this.root.append(this.$.faceMount);
        this.faceRefine(i);
      } catch (e) {
        this.closeFaceMount();
        this.toast(T("Не удалось открыть рефайн лица: ") + (e.message || e), true);
      }
    },

    closeFaceMount() {
      if (!this.$.faceMount) return;
      this.$.faceMount.remove();
      this.$.faceMount = null;
      if (!this._faceV6WasEnabled) delete document.documentElement.dataset.v6;
    },

    // The modern workspace doesn't have pages; this small bridge lets
    // swapBuild() return to the regular timeline after creating its project.
    setPage(page) {
      if (page === "swap") this.openSwapWorkspace();
      else if (page === "edit" && this.tool === "swap") this.closeSwapWorkspace();
    },
  });
}
