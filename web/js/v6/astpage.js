// H3ZeroStudio Lab v6e — «Ассистент» page: [chat list | open conversation | assistant settings].
// The engine (h3s_assist.js) still renders the conversation and the settings view; this file only places them
// side by side instead of the settings replacing the chat, and adds a real list of dialogs on the left.
import { T, lang } from "../h3s_i18n.js";
import { I, btn, setTip, modal } from "./kit.js";

const PK = "h3ls.v6.astPane";            // "1" settings column open, "0" closed (default: open on wide windows)
const WIDE = 1180, MID = 860;            // page widths (CSS px of the studio root)
const paneSaved = () => { try { const v = localStorage.getItem(PK); return v === "1" ? true : v === "0" ? false : null; } catch { return null; } };
const paneSave = (on) => { try { localStorage.setItem(PK, on ? "1" : "0"); } catch {} };
const LOC = { ru: "ru-RU", en: "en-GB", th: "th-TH", zh: "zh-CN" };

export function installAstPage(Studio, { h }) {
  Object.assign(Studio.prototype, {
    astPageMode() {
      const w = this.$.pAst?.clientWidth || this.root?.clientWidth || window.innerWidth;
      return w >= WIDE ? "wide" : w >= MID ? "mid" : "narrow";
    },
    renderAssistPage() {
      const $ = this.$, host = $.astHost, side = $.astSide, set = $.astSet, pg = $.pAst;
      const first = !this._ast;
      if (this._ast) this.astCaptureDraft();
      const mode = this.astPageMode();
      // first open of the page: the settings column follows the saved choice, else it is open on wide windows
      let open = first || this._ast.v6PaneInit !== true ? (paneSaved() ?? mode === "wide") : !!this._ast.setOpen;
      host.innerHTML = ""; set.innerHTML = ""; side.innerHTML = "";
      if (this._ast) this._ast.setOpen = false;
      this.renderAssistPanel(host);                   // conversation (creates this._ast on the first call)
      const A = this._ast; A.v6PaneInit = true;
      if (open) { A.setOpen = true; this.renderAssistSettingsView(set); this.astV6SetChrome(set); }
      A.el = pg;                                       // engine lookups (textarea, status, style list…) see all three columns
      paneSave(open);
      const list = mode !== "narrow" && !(mode === "mid" && open);
      pg.dataset.mode = mode; pg.classList.toggle("has-list", list); pg.classList.toggle("has-set", open);
      if (list) this.astRenderChatList(side);
      this.astV6ChatChrome(host, list, open);
      this.astWatchWidth(mode);
      const log = host.querySelector(".h3l-ast-log"); if (log) log.scrollTop = log.scrollHeight;
    },
    /** Re-lay the page when it crosses a width step (the columns are chosen in JS: the engine DOM differs per mode). */
    astWatchWidth(mode) {
      if (!this._astRO && window.ResizeObserver) {
        this._astRO = new ResizeObserver(() => {
          if (this.page !== "assist" || !this.$.pAst?.isConnected) return;
          clearTimeout(this._astRT);
          this._astRT = setTimeout(() => { if (this.astPageMode() !== this.$.pAst.dataset.mode) this.renderAssistPage(); }, 120);
        });
        this._astRO.observe(this.$.pAst);
      }
    },
    astToggleSettingsPane(on = !this._ast?.setOpen, tab) {
      if (!this._ast) return;
      if (on) return this.astOpenSettings(tab || this._ast.setTab || "connection");
      this._ast.setOpen = false; this._ast.styleDraft = null; this.renderLeft();
    },
    /** The settings view lives in its own column: «←» becomes «hide», the title stays. */
    astV6SetChrome(set) {
      const b = set.querySelector(".h3l-ast-settings > .h3l-ph > .h3l-btn");
      if (b) {
        b.innerHTML = I.sidebarR || I.close; b.classList.add("v6-ast-hide"); b.removeAttribute("title");
        b.setAttribute("aria-label", T("Скрыть настройки")); setTip(b, T("Скрыть настройки"), "Esc");
        b.parentElement.append(b);                       // close button on the right of the heading
      }
    },
    /** Conversation chrome: the list on the left replaces the «Диалог» drop-down; the gear toggles the column. */
    astV6ChatChrome(host, list, open) {
      const panel = host.querySelector(".h3l-ast-panel"); if (!panel) return;
      const hist = panel.querySelector(".h3l-ast-histrow"), modeRow = panel.querySelector(".h3l-ast-moderow");
      if (list && hist && modeRow) {
        const acts = hist.querySelector(".h3l-ast-histacts");
        acts?.firstElementChild?.remove();               // «+ новый чат» is in the list header
        if (acts) modeRow.append(acts);
        hist.remove();
      }
      const title = panel.querySelector(":scope > .h3l-ph h3"), chat = this.astChat?.();
      if (title && list) { title.textContent = chat?.title || T("Новый диалог"); setTip(title, title.textContent); title.classList.add("v6-ast-title"); }
      const gear = panel.querySelector(".h3l-ast-gear");
      if (gear) {
        gear.onclick = (e) => { e.stopPropagation(); this.astToggleSettingsPane(!open); };
        gear.setAttribute("aria-pressed", String(open)); gear.classList.toggle("on", open);
        gear.removeAttribute("title"); setTip(gear, open ? T("Скрыть настройки") : T("Настройки ассистента"));
      }
    },
    astChatMeta(c) {
      const n = c.msgs?.length || 0, d = c.created ? new Date(c.created) : null, loc = LOC[lang()] || "ru-RU";
      let when = "";
      if (d) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        when = d >= today ? d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString(loc, { day: "numeric", month: "short" });
      }
      return [when, n ? T("Сообщений: {0}", n) : T("Пусто")].filter(Boolean).join(" · ");
    },
    astRenderChatList(side) {
      const a = this.p.assistant, chats = a.chats || [];
      const head = h("div", { class: "v6-chl-h" }, h("b", null, T("Диалоги")),
        btn({ icon: I.plus, size: "sm", tip: T("Новый чат"), cls: "v6-chl-new", onclick: () => this.astNewChat() }));
      const ul = h("div", { class: "v6-chl-list", role: "listbox", "aria-label": T("Диалоги") });
      for (const c of chats) {
        const on = c.id === a.active, name = c.title || T("Новый диалог");
        const nm = h("span", { class: "v6-chl-n" }, name);
        const it = h("div", { class: "v6-chl-it" + (on ? " on" : ""), role: "option", "aria-selected": String(on), tabindex: on ? "0" : "-1", dataset: { chat: c.id } },
          h("span", { class: "v6-chl-tx" }, nm, h("span", { class: "v6-chl-m" }, this.astChatMeta(c))),
          h("span", { class: "v6-chl-acts" },
            btn({ icon: I.pencil, size: "sm", tip: T("Переименовать"), cls: "v6-chl-ren", onclick: (e) => { e.stopPropagation(); this.astV6Rename(c.id, it); } }),
            btn({ icon: I.trash, size: "sm", tip: T("Удалить диалог"), cls: "v6-chl-del", onclick: (e) => { e.stopPropagation(); this.astV6Delete(c.id); } })));
        setTip(nm, name);
        it.onclick = () => { if (!on) this.astSelectChat(c.id); };
        it.ondblclick = (e) => { e.preventDefault(); this.astV6Rename(c.id, it); };
        it.onkeydown = (e) => {
          if (e.target !== it) return;
          const items = [...ul.children], i = items.indexOf(it);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
          else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); this.astSelectChat(c.id); setTimeout(() => this.$.astSide.querySelector(`[data-chat="${c.id}"]`)?.focus(), 0); }
          else if (e.key === "F2") { e.preventDefault(); this.astV6Rename(c.id, it); }
          else if (e.key === "Delete") { e.preventDefault(); e.stopPropagation(); this.astV6Delete(c.id); }
        };
        ul.append(it);
      }
      if (!chats.length) ul.append(h("div", { class: "v6-chl-empty" }, T("Пока нет диалогов")));
      side.append(head, ul);
      ul.querySelector(".on")?.scrollIntoView?.({ block: "nearest" });
    },
    astV6Rename(cid, it) {
      const c = this.p.assistant.chats.find((x) => x.id === cid); if (!c || !it) return;
      const tx = it.querySelector(".v6-chl-tx"); if (!tx || it.querySelector("input")) return;
      const inp = h("input", { class: "v6-chl-in", value: c.title || "", placeholder: T("Название чата"), "aria-label": T("Название чата"), maxlength: "120", spellcheck: "false" });
      let done = false;
      const fin = (ok) => {
        if (done) return; done = true;
        if (ok) { const t = inp.value.trim().slice(0, 120); this.astSet((a) => { const x = a.chats.find((y) => y.id === cid); if (x) x.title = t; }); }
        this.renderLeft();
      };
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); fin(true); } else if (e.key === "Escape") { e.preventDefault(); fin(false); } };
      inp.onblur = () => fin(true);
      inp.onclick = (e) => e.stopPropagation();
      tx.replaceWith(inp); inp.focus(); inp.select();
    },
    astV6Delete(cid) {
      const c = this.p.assistant.chats.find((x) => x.id === cid); if (!c) return;
      const go = () => {
        this.astSet((a) => { a.chats = a.chats.filter((x) => x.id !== cid); if (a.active === cid) a.active = a.chats[0]?.id || ""; });
        if (!this.astChat()) this.astNewChat(); else this.renderAssist();
      };
      if (!c.msgs?.length) return go();
      let m;
      const box = h("div", { class: "v6-ask" },
        h("h3", null, T("Удалить этот диалог?")),
        h("p", null, T("«{0}» и его сообщения будут удалены.", c.title || T("Новый диалог"))),
        h("div", { class: "v6-ask-b" },
          btn({ label: T("Отмена"), onclick: () => m.close() }),
          btn({ label: T("Удалить"), kind: "danger", onclick: () => { m.close(); go(); } })));
      m = modal(this.root, box, { cls: "v6-askwin", label: T("Удалить этот диалог?") });
      setTimeout(() => box.querySelector(".v6-ask-b .v6-b:last-child")?.focus(), 60);
    },
  });
}
