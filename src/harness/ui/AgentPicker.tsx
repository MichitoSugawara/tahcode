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
  type ProviderDriverKind,
} from "@/lib/providers";

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
    const live = (org.runtimes ?? []).filter((runtime) => isLive(runtime, org.now) && runtime.canUse);
    return new Set(live.flatMap((runtime) => runtime.providers.filter((item) => item.available).map((item) => item.driverKind)));
  }, [org.runtimes, org.now]);
  const anyLive = (org.runtimes ?? []).some((runtime) => isLive(runtime, org.now));
  const models = modelsFor(driverKind);
  const pickable = supportsModelPick(driverKind);
  const provider = PROVIDERS[driverKind];

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="プロバイダ">
        {(Object.entries(PROVIDERS) as [ProviderDriverKind, (typeof PROVIDERS)[ProviderDriverKind]][]).map(([kind, info]) => {
          const on = kind === driverKind;
          const tag = installed.has(kind) ? "利用可" : anyLive ? "未検出" : null;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (kind !== driverKind) onChange(kind, null);
              }}
              className={`flex h-9 items-center gap-2 rounded-control px-2 text-left text-[12.5px] transition-[background-color,box-shadow,color] duration-150 ${
                on ? "bg-hover-2 text-ink shadow-[0_0_0_1px_var(--line-strong)]" : "bg-field text-ink-2 shadow-hairline hover:bg-hover hover:text-ink"
              }`}
            >
              <Monogram color={info.color}>{info.label.charAt(0)}</Monogram>
              <span className="min-w-0 flex-1 truncate font-medium">{info.label}</span>
              {tag && <span className={`shrink-0 text-[10.5px] ${tag === "利用可" ? "text-green" : "text-ink-3"}`}>{tag}</span>}
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
            className="flex h-9 w-full items-center gap-2 rounded-control bg-field px-3 text-left text-[13px] text-ink shadow-hairline transition-[box-shadow] duration-150 hover:shadow-[0_0_0_1px_var(--line-strong)] disabled:opacity-60"
          >
            <span className="shrink-0 text-[12px] text-ink-3">モデル</span>
            <span className="min-w-0 flex-1 truncate">
              {model ? (
                <>
                  <span className="font-mono text-[12.5px]">{model}</span>
                  {modelDisplayName(driverKind, model) !== model && <span className="ml-1.5 text-ink-3">{modelDisplayName(driverKind, model)}</span>}
                </>
              ) : pickable ? (
                <span className="text-ink-2">既定モデル（{provider.label} CLI の設定に従う）</span>
              ) : (
                <span className="text-ink-2">{provider.label} は headless CLI がなく、モデルは選べません</span>
              )}
            </span>
            <ChevronDown size={13} className="shrink-0 text-ink-3" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-[80] w-[var(--radix-popover-trigger-width)] rounded-[10px] bg-surface p-1 shadow-raised outline-none"
            style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both" }}
          >
            <GlideMenu className="flex max-h-64 flex-col gap-px overflow-y-auto" highlightClassName="inset-x-0 rounded-[6px] bg-hover">
              {[{ slug: "", name: `既定モデル · ${provider.label} CLI の設定に従う`, legacy: false }, ...models].map((option) => {
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
                      <span className="block truncate text-[12.5px] font-medium text-ink">{option.slug ? option.name : "既定モデル"}</span>
                      <span className="block truncate font-mono text-[11px] text-ink-3">{option.slug || `${provider.label} CLI の設定に従う（@${provider.handle} だけの指名）`}</span>
                    </span>
                    {option.legacy && <span className="shrink-0 text-[10.5px] text-ink-3">legacy</span>}
                    <span className={`shrink-0 text-ink ${on ? "" : "invisible"}`}>
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                  </button>
                );
              })}
            </GlideMenu>
            <div className="mt-1 border-t border-line px-2 pt-1.5 pb-1 text-[11px] leading-relaxed text-ink-3">
              出典: {modelSourceHint(driverKind)}。一覧にないスラッグも <code className="font-mono">@{provider.handle}/&lt;slug&gt;</code> で直接指名できます。
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <p className="text-[12px] leading-relaxed text-ink-3">
        メンションなしで送ると <code className="rounded-[4px] bg-accent-tint px-1 py-px font-mono text-[11.5px] text-accent-ink">{agentMention(driverKind, model)}</code> が自動付与されます
        {model ? "（モデルまで指名）" : `（${provider.label} の既定モデル）`}。
      </p>
    </div>
  );
}
