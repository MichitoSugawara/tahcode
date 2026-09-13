import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import { Monogram } from "@/components/atoms/EntityChip";
import GlideMenu from "@/components/primitives/GlideMenu";
import { isLive, useOrg } from "@/harness/OrgContext";
import {
  PROVIDERS,
  agentMention,
  modelDisplayName,
  modelSourceHint,
  modelsFor,
  supportsModelPick,
} from "@/lib/providers";
import type { ProviderDriverKind } from "@/lib/providers";

/* ─────────────────────────────────────────────────────────
 * AGENT PICKER — provider grid + model menu, the same pair the
 * composer's pill pickers expose, for dialogs that bind a chat
 * to an agent up front. Shows what the mention will look like
 * (`@cursor/muse-spark-1.3`) so the rule is visible while choosing.
 * ───────────────────────────────────────────────────────── */

export function AgentPicker({
  driverKind,
  model,
  onChange,
}: {
  driverKind: ProviderDriverKind;
  model: string | null;
  onChange: (driverKind: ProviderDriverKind, model: string | null) => void;
}) {
  const org = useOrg();
  const [open, setOpen] = useState(false);
  const installed = useMemo(() => {
    const live = (org.runtimes ?? []).filter(
      (runtime) => isLive(runtime, org.now) && runtime.canUse
    );
    return new Set(
      live.flatMap((runtime) =>
        runtime.providers
          .filter((item) => item.available)
          .map((item) => item.driverKind)
      )
    );
  }, [org.runtimes, org.now]);
  const anyLive = (org.runtimes ?? []).some((runtime) =>
    isLive(runtime, org.now)
  );
  const models = modelsFor(driverKind);
  const pickable = supportsModelPick(driverKind);
  const provider = PROVIDERS[driverKind];

  return (
    <div className="flex flex-col gap-2">
      <div
        className="grid grid-cols-3 gap-1.5"
        role="radiogroup"
        aria-label="プロバイダ"
      >
        {(
          Object.entries(PROVIDERS) as [
            ProviderDriverKind,
            (typeof PROVIDERS)[ProviderDriverKind],
          ][]
        ).map(([kind, info]) => {
          const on = kind === driverKind;
          const tag = installed.has(kind)
            ? "利用可"
            : anyLive
              ? "未検出"
              : null;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (kind !== driverKind) {
                  onChange(kind, null);
                }
              }}
              className={`rounded-control flex h-9 items-center gap-2 px-2 text-left text-[12.5px] transition-[background-color,box-shadow,color] duration-150 ${
                on
                  ? "bg-hover-2 text-ink shadow-[0_0_0_1px_var(--line-strong)]"
                  : "bg-field text-ink-2 shadow-hairline hover:bg-hover hover:text-ink"
              }`}
            >
              <Monogram color={info.color}>{info.label.charAt(0)}</Monogram>
              <span className="min-w-0 flex-1 truncate font-medium">
                {info.label}
              </span>
              {tag && (
                <span
                  className={`shrink-0 text-[10.5px] ${tag === "利用可" ? "text-green" : "text-ink-3"}`}
                >
                  {tag}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="モデルを選択"
            aria-expanded={open}
            disabled={!pickable}
            className="rounded-control bg-field text-ink shadow-hairline flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] transition-[box-shadow] duration-150 hover:shadow-[0_0_0_1px_var(--line-strong)] disabled:opacity-60"
          >
            <span className="text-ink-3 shrink-0 text-[12px]">モデル</span>
            <span className="min-w-0 flex-1 truncate">
              {model ? (
                <>
                  <span className="font-mono text-[12.5px]">{model}</span>
                  {modelDisplayName(driverKind, model) !== model && (
                    <span className="text-ink-3 ml-1.5">
                      {modelDisplayName(driverKind, model)}
                    </span>
                  )}
                </>
              ) : pickable ? (
                <span className="text-ink-2">
                  既定モデル（{provider.label} CLI の設定に従う）
                </span>
              ) : (
                <span className="text-ink-2">
                  {provider.label} は headless CLI がなく、モデルは選べません
                </span>
              )}
            </span>
            <ChevronDown size={13} className="text-ink-3 shrink-0" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="bg-surface shadow-raised z-[80] w-[var(--radix-popover-trigger-width)] rounded-[10px] p-1 outline-none"
            style={{
              animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both",
            }}
          >
            <GlideMenu
              className="flex max-h-64 flex-col gap-px overflow-y-auto"
              highlightClassName="inset-x-0 rounded-[6px] bg-hover"
            >
              {[
                {
                  legacy: false,
                  name: `既定モデル · ${provider.label} CLI の設定に従う`,
                  slug: "",
                },
                ...models,
              ].map((option) => {
                const on = (model ?? "") === option.slug;
                return (
                  <button
                    key={option.slug || "default"}
                    type="button"
                    data-menu-row
                    onClick={() => {
                      setOpen(false);
                      onChange(driverKind, option.slug || null);
                    }}
                    className="relative z-10 flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block truncate text-[12.5px] font-medium">
                        {option.slug ? option.name : "既定モデル"}
                      </span>
                      <span className="text-ink-3 block truncate font-mono text-[11px]">
                        {option.slug ||
                          `${provider.label} CLI の設定に従う（@${provider.handle} だけの指名）`}
                      </span>
                    </span>
                    {option.legacy && (
                      <span className="text-ink-3 shrink-0 text-[10.5px]">
                        legacy
                      </span>
                    )}
                    <span
                      className={`text-ink shrink-0 ${on ? "" : "invisible"}`}
                    >
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                  </button>
                );
              })}
            </GlideMenu>
            <div className="border-line text-ink-3 mt-1 border-t px-2 pt-1.5 pb-1 text-[11px] leading-relaxed">
              出典: {modelSourceHint(driverKind)}。一覧にないスラッグも{" "}
              <code className="font-mono">@{provider.handle}/&lt;slug&gt;</code>{" "}
              で直接指名できます。
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <p className="text-ink-3 text-[12px] leading-relaxed">
        メンションなしで送ると{" "}
        <code className="bg-accent-tint text-accent-ink rounded-[4px] px-1 py-px font-mono text-[11.5px]">
          {agentMention(driverKind, model)}
        </code>{" "}
        が自動付与されます
        {model ? "（モデルまで指名）" : `（${provider.label} の既定モデル）`}。
      </p>
    </div>
  );
}
