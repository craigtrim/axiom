import { useEffect, useState, useRef, type ReactNode } from "react";
import type { ChromeMenuItem } from "../shared/window-chrome";
import { report, onCommand, command, preferences } from "./client";
import { accessKey } from "../shared/shortcuts";
import { AccessLabel, ContextMenu, type ContextAction } from "./ContextMenu";
import "./window-chrome.css";
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
export function WindowChrome() {
  const root = useRef<HTMLDivElement>(null);
  const [access, setAccess] = useState(false);
  const [items, setItems] = useState<ChromeMenuItem[]>([]);
  const [roving, setRoving] = useState("menu.file");
  const [popup, setPopup] = useState<{
    id: string;
    trigger: HTMLButtonElement;
    x: number;
    y: number;
    focus: "first" | "last" | "menu";
  }>();
  const [info, setInfo] =
    useState<Awaited<ReturnType<typeof window.axiom.chrome.info>>>();
  const serial = useRef(0);
  const close = () => {
    serial.current++;
    setPopup(undefined);
    setAccess(false);
  };
  const buttons = () =>
    [
      ...(root.current?.querySelectorAll<HTMLButtonElement>(
        ".mtrigger,.mcompact",
      ) ?? []),
    ].filter((b) => b.getClientRects().length);
  const focusMenu = () => {
    close();
    setAccess(true);
    buttons()[0]?.focus();
  };
  const open = async (
    id: string,
    trigger: HTMLButtonElement,
    focus: "first" | "last" | "menu" = "first",
  ) => {
    const ticket = ++serial.current;
    try {
      const fresh = await window.axiom.chrome.menus();
      if (ticket !== serial.current || !trigger.isConnected) return;
      setItems(fresh);
      if (id !== "compact" && !fresh.find((m) => m.id === id)?.enabled) return;
      if (trigger.dataset.menuId) setRoving(trigger.dataset.menuId);
      const rect = trigger.getBoundingClientRect();
      setPopup({ id, trigger, x: rect.left, y: rect.bottom, focus });
    } catch (e) {
      report((e as Error).message, true);
    }
  };
  const openById = (id: string) => {
    setAccess(true);
    const trigger =
      buttons().find((b) => b.dataset.menuId === id) ?? buttons()[0];
    if (trigger) void open(id, trigger);
  };
  useEffect(() => {
    let live = true;
    void Promise.all([window.axiom.chrome.info(), window.axiom.chrome.menus()])
      .then(([info, items]) => {
        if (live) {
          setInfo(info);
          setItems(items);
        }
      })
      .catch((e) => report(e.message, true));
    const off = window.axiom.onEvent((e) => {
      if (e.type === "window-title") setInfo(e.data);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (!info?.custom) return;
    let bareAlt = false;
    const off = onCommand((id) => {
      if (id === "menu.focus") focusMenu();
      if (id.startsWith("menu.open:")) {
        // Native Alt+letter is consumed before the renderer sees its keydown.
        bareAlt = false;
        openById(id.slice(10));
      }
      if (id === "keyboard.changed")
        void window.axiom.chrome.menus().then(setItems);
    });
    const down = (event: KeyboardEvent) => {
      if (
        event.key === "Alt" &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey
      )
        bareAlt = true;
      else bareAlt = false;
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        event.key.length === 1 &&
        !document.querySelector(
          "dialog[open],.entity-context-menu:not(.chrome-menu)",
        )
      ) {
        const item = items.find(
          (m) =>
            accessKey(m.id, preferences.keyboard) === event.key.toUpperCase(),
        );
        if (item) {
          event.preventDefault();
          event.stopImmediatePropagation();
          openById(item.id);
        }
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== "Alt" || !bareAlt) return;
      bareAlt = false;
      if (
        document.querySelector(
          "dialog[open],.entity-context-menu:not(.chrome-menu)",
        )
      )
        return;
      event.preventDefault();
      if (
        document.querySelector(".chrome-menu") ||
        document.documentElement.dataset.menuAccess === "true"
      )
        close();
      else focusMenu();
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      off();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, [info?.custom, items]);
  useEffect(() => {
    document.documentElement.dataset.menuAccess = String(access);
    return () => {
      delete document.documentElement.dataset.menuAccess;
    };
  }, [access]);
  useEffect(() => {
    if (!popup) return;
    const resized = () => close();
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, [popup]);
  const actions = (list: ChromeMenuItem[]): (ContextAction | null)[] =>
    list.map((item) =>
      item.separator
        ? null
        : {
            key: item.id,
            accessKey: item.key,
            label: item.label,
            accelerator: item.accelerator,
            enabled: item.enabled,
            visible: item.visible,
            checked: item.checked,
            radio: item.radio,
            children: item.children ? actions(item.children) : undefined,
            run: () =>
              window.axiom.chrome
                .execute(item.id, item.label)
                .catch((e) => report(e.message, true)),
          },
    );
  if (!info?.custom) return null;
  const folder = info.directory.replace(/[\\/]$/, "");
  return (
    <div className="window-chrome" ref={root} data-alt={access ? "on" : "off"}>
      <header
        className="titlebar window-titlebar"
        data-testid="window-titlebar"
      >
        <div className="appmark" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect
              x="2"
              y="2"
              width="20"
              height="20"
              rx="4"
              fill="var(--accent)"
            />
            <path
              d="M7.6 17.4 12 6.6l4.4 10.8M9.3 14.1h5.4"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <button
          type="button"
          className="mcompact"
          aria-label="Application menu"
          aria-haspopup="menu"
          aria-expanded={popup?.trigger.classList.contains("mcompact") ?? false}
          onClick={(e) =>
            popup ? close() : void open("compact", e.currentTarget, "menu")
          }
          onKeyDown={(e) => {
            if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              void open(
                "compact",
                e.currentTarget,
                e.key === "ArrowUp" ? "last" : "first",
              );
            }
          }}
        >
          <Glyph>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </Glyph>
        </button>
        <nav
          className="menubar"
          role="menubar"
          aria-label="Application menus"
          onKeyDown={(e) => {
            const list = buttons(),
              at = list.indexOf(e.target as HTMLButtonElement);
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
              e.preventDefault();
              list[
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? list.length - 1
                    : (at + (e.key === "ArrowRight" ? 1 : -1) + list.length) %
                      list.length
              ]?.focus();
            } else if (["ArrowDown", "ArrowUp"].includes(e.key)) {
              e.preventDefault();
              const trigger = list[at];
              void open(
                trigger.dataset.menuId!,
                trigger,
                e.key === "ArrowUp" ? "last" : "first",
              );
            } else if (e.key === "Escape") {
              close();
              setAccess(false);
            } else if (e.key === "Tab") {
              close();
              setAccess(false);
            } else if (
              e.key.length === 1 &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              const item = items.find(
                (m) =>
                  accessKey(m.id, preferences.keyboard) === e.key.toUpperCase(),
              );
              if (item) {
                e.preventDefault();
                openById(item.id);
              }
            }
          }}
        >
          {items.map((item) => (
            <button
              type="button"
              className="mtrigger"
              role="menuitem"
              key={item.id}
              data-menu-id={item.id}
              tabIndex={roving === item.id ? 0 : -1}
              aria-haspopup="menu"
              aria-expanded={popup?.id === item.id}
              onFocus={() => setRoving(item.id)}
              onClick={(e) =>
                popup?.id === item.id
                  ? close()
                  : void open(item.id, e.currentTarget, "menu")
              }
              onPointerMove={(e) => {
                if (popup && popup.id !== item.id)
                  void open(item.id, e.currentTarget, "menu");
              }}
            >
              <AccessLabel
                label={item.label}
                letter={accessKey(item.id, preferences.keyboard)}
              />
            </button>
          ))}
        </nav>
        <div className="docwrap">
          <button
            type="button"
            className="doc"
            aria-haspopup="dialog"
            title="Open the command palette"
            aria-label={`Axiom. ${info.fileName}${info.dirty ? ", unsaved changes" : ""}. ${folder}. Open the command palette`}
            onClick={() => command("palette")}
          >
            <Glyph>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M15.8 15.8 20.5 20.5" />
            </Glyph>
            <strong className="name">{info.fileName}</strong>
            {info.dirty && (
              <span className="dirty" title="Unsaved changes">
                *
              </span>
            )}
            <span className="path">{folder}</span>
          </button>
        </div>
      </header>
      {popup && (
        <ContextMenu
          key={popup.id}
          document={document}
          actions={actions(
            popup.id === "compact"
              ? items
              : (items.find((m) => m.id === popup.id)?.children ?? []),
          )}
          x={popup.x}
          y={popup.y}
          trigger={popup.trigger}
          label={
            popup.id === "compact"
              ? "Application menu"
              : items.find((m) => m.id === popup.id)?.label
          }
          close={close}
          appearance="chrome"
          initialFocus={popup.focus}
          onNextMenu={
            popup.trigger.classList.contains("mcompact")
              ? undefined
              : (direction) => {
                  const index = items.findIndex((m) => m.id === popup.id),
                    next =
                      items[(index + direction + items.length) % items.length];
                  const trigger = buttons().find(
                    (b) => b.dataset.menuId === next.id,
                  );
                  if (trigger) void open(next.id, trigger);
                }
          }
        />
      )}
    </div>
  );
}
