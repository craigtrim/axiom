import { useEffect, useState, useRef } from "react";
import { menuTree } from "../shared/commands";
import { report, onCommand, preferences } from "./client";
import { accessKey } from "../shared/shortcuts";
import { AccessLabel } from "./ContextMenu";
export function WindowChrome() {
  const menus = useRef<HTMLElement>(null);
  const [access, setAccess] = useState(false);
  const [, refresh] = useState(0);
  useEffect(
    () =>
      onCommand((id) => {
        if (id === "menu.focus") {
          setAccess(true);
          menus.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
        if (id === "keyboard.changed") refresh((v) => v + 1);
      }),
    [],
  );
  const [info, setInfo] = useState<{
    custom: boolean;
    directory: string;
    fileName: string;
    dirty: boolean;
  }>();
  useEffect(() => {
    let live = true;
    void window.axiom.chrome
      .info()
      .then((i) => live && setInfo(i))
      .catch((e) => report(e.message, true));
    const off = window.axiom.onEvent((e) => {
      if (e.type === "window-title") setInfo(e.data);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  if (!info?.custom) return null;
  return (
    <>
      <div className="window-titlebar" data-testid="window-titlebar">
        <span className="window-app-icon" aria-hidden="true">
          A
        </span>
        <div className="window-title" title={info.directory + info.fileName}>
          Axiom | <span>{info.directory}</span>
          <strong>{info.fileName}</strong>
          {info.dirty && <span aria-label="Unsaved changes"> *</span>}
        </div>
      </div>
      <nav
        ref={menus}
        className="window-menubar"
        aria-label="Application menus"
        onKeyDown={(e) => {
          const buttons = [
              ...menus.current!.querySelectorAll<HTMLButtonElement>("button"),
            ],
            at = buttons.indexOf(e.target as HTMLButtonElement);
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            buttons[
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? buttons.length - 1
                  : (at + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                    buttons.length
            ]?.focus();
          } else if (e.key === "Escape") {
            setAccess(false);
            (e.target as HTMLElement).blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            buttons[at]?.click();
          } else if (
            e.key.length === 1 &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey
          ) {
            const button = buttons.find(
              (b) =>
                accessKey(b.dataset.menuId!, preferences.keyboard) ===
                e.key.toUpperCase(),
            );
            if (button) {
              e.preventDefault();
              button.click();
            }
          }
        }}
      >
        {menuTree.map((m) =>
          m && typeof m !== "string" ? (
            <button
              key={m.id}
              data-menu-id={m.id}
              aria-haspopup="menu"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                void window.axiom.chrome
                  .menu(m.id, r.left, r.bottom)
                  .catch((e) => report(e.message, true));
              }}
            >
              {access ? (
                <AccessLabel
                  label={m.label}
                  letter={accessKey(m.id, preferences.keyboard)}
                />
              ) : (
                m.label
              )}
            </button>
          ) : null,
        )}
      </nav>
    </>
  );
}
