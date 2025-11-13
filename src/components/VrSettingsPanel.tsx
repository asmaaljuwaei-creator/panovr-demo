"use client";

import React from "react";

type ModeKey = "NORMAL" | "CARDBOARD" | "STEREO";

/* ---------- i18n: ترجمة مبسطة ---------- */
const MESSAGES = {
  en: {
    settings: "Settings",
    close: "Close",
    mode: "Mode",
    normal: "Normal",
    cardboard: "Cardboard",
    stereo: "Stereoscopic",
    controls: "Controls",
    navButtons: "Navigation Buttons (Next/Prev)",
    vr: "VR (WebXR)",
    enterVr: "Enter VR",
    exitVr: "Exit VR",
    vrNotSupported: "VR not supported",
  },
  ar: {
    settings: "الإعدادات",
    close: "إغلاق",
    mode: "الوضع",
    normal: "عادي",
    cardboard: "كرتون (Cardboard)",
    stereo: "مجسّم (Stereoscopic)",
    controls: "التحكم",
    navButtons: "أزرار التنقل (التالي/السابق)",
    vr: "الواقع الافتراضي (WebXR)",
    enterVr: "دخول الواقع الافتراضي",
    exitVr: "الخروج من الواقع الافتراضي",
    vrNotSupported: "الواقع الافتراضي غير مدعوم",
  },
};
type LangKey = keyof typeof MESSAGES;

/** يحدد العربية إذا: lang تبدأ بـ ar أو dir=rtl أو document.dir=rtl */
function chooseLang(lang?: string, dir?: "ltr" | "rtl"): LangKey {
  const htmlDir = (typeof document !== "undefined" ? (document.dir as "ltr" | "rtl" | "") : "");
  const isAr =
    (lang || "").toLowerCase().startsWith("ar") ||
    dir === "rtl" ||
    htmlDir === "rtl";
  return isAr ? "ar" : "en";
}
function t(key: keyof typeof MESSAGES.en, lang?: string, dir?: "ltr" | "rtl"): string {
  const k = chooseLang(lang, dir);
  return MESSAGES[k][key];
}

/* ---------- helpers: نقلب تموضع اللوحة فقط، المحتوى يبقى LTR ---------- */
function inferIsRTL(lang?: string) {
  const r = (lang || "").toLowerCase();
  return r.startsWith("ar") || r.startsWith("he") || r.startsWith("fa") || r.startsWith("ur");
}
function isRTLFrom(dir?: "ltr" | "rtl", lang?: string) {
  const htmlDir = (typeof document !== "undefined" ? (document.dir as "ltr" | "rtl" | "") : "");
  return (dir || htmlDir || (inferIsRTL(lang) ? "rtl" : "ltr")) === "rtl";
}
const dockStyle = (rtl: boolean) =>
  rtl ? ({ left: 16 } as const) : ({ right: 16 } as const);
const dockOrigin = (rtl: boolean) => (rtl ? "bottom left" : "bottom right");

export type VrSettingsPanelProps = {
  open: boolean;
  uiScale: number;

  mode: ModeKey;
  onChangeMode: (m: ModeKey) => void;

  navButtonsVisible: boolean;
  onToggleNavButtons: () => void;

  xrSupported: boolean;
  xrActive: boolean;
  onEnterXR: () => void | Promise<void>;
  onExitXR: () => void | Promise<void>;

  vrSettingsIconUrl?: string;
  onRequestClose?: () => void;

  style?: React.CSSProperties;

  /** تمرير اللغة/الاتجاه (اختياري) */
  dir?: "ltr" | "rtl";
  lang?: string;
};

export default function VrSettingsPanel({
  open,
  uiScale,
  mode,
  onChangeMode,
  navButtonsVisible,
  onToggleNavButtons,
  xrSupported,
  xrActive,
  onEnterXR,
  onExitXR,
  vrSettingsIconUrl,
  onRequestClose,
  style,
  dir,
  lang,
}: VrSettingsPanelProps) {
  if (!open) return null;

  const dockRTL = isRTLFrom(dir, lang);
  const L = (k: keyof typeof MESSAGES.en) => t(k, lang, dir);

  return (
    <div
      key={`vr-${dir}-${lang ?? ""}`}  // يضمن إعادة التركيب عند تغيير اللغة/الاتجاه
      style={{
        position: "absolute",
        ...dockStyle(dockRTL),
        bottom: "4%",
        zIndex: 13,
        width: 260,
        background: "rgba(255,255,255,0.98)",
        borderRadius: 12,
        boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
        overflow: "hidden",
        transform: `scale(${uiScale})`,
        transformOrigin: dockOrigin(dockRTL),
        ...style,
      }}
      /* لا نضع dir="rtl" هنا: المحتوى يبقى LTR كما هو */
    >
      <SectionHeader
        title={L("settings")}
        onRequestClose={onRequestClose}
        closeLabel={L("close")}
        dockRTL={dockRTL}
      />

      {/* Mode */}
      <SubHeader>{L("mode")}</SubHeader>
      {(
        [
          { key: "NORMAL", label: L("normal") },
          { key: "CARDBOARD", label: L("cardboard") },
          { key: "STEREO", label: L("stereo") },
        ] as { key: ModeKey; label: string }[]
      ).map((opt) => (
        <RowButton
          key={opt.key}
          onClick={() => onChangeMode(opt.key)}
          checked={mode === opt.key}
          label={opt.label}
        />
      ))}

      {/* Controls */}
      <SubHeader>{L("controls")}</SubHeader>
      <ToggleRow
        label={L("navButtons")}
        checked={navButtonsVisible}
        onToggle={onToggleNavButtons}
      />

      {/* VR (WebXR) */}
      <SubHeader>{L("vr")}</SubHeader>
      {!xrActive ? (
        <ActionRow
          iconSrc={vrSettingsIconUrl}
          label={xrSupported ? L("enterVr") : L("vrNotSupported")}
          disabled={!xrSupported}
          onClick={onEnterXR}
        />
      ) : (
        <ActionRow iconSrc={vrSettingsIconUrl} label={L("exitVr")} onClick={onExitXR} />
      )}
    </div>
  );
}


function SectionHeader({
  title,
  onRequestClose,
  closeLabel,
   dockRTL,
}: {
  title: string;
  onRequestClose?: () => void;
  closeLabel: string;
  dockRTL: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        fontWeight: 700,
        fontSize: 14,
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(0,0,0,0.02)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>{title}</span>
        <span style={{ opacity: 0.5, fontWeight: 400 }}>•</span>
      </div>
      {onRequestClose && (
        <button
          onClick={onRequestClose}
          aria-label={closeLabel}
          title={closeLabel}
          style={{
           position: "absolute",
            top: 8,
            ...(dockRTL ? { left: 8 } : { right: 8 }), // ← يثبت في الزاوية الصحيحة
            background: "transparent",
            border: 0,
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 2,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function SubHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 12px",
        fontWeight: 600,
        fontSize: 12,
        color: "rgba(0,0,0,0.7)",
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        borderTop: "1px solid rgba(0,0,0,0.04)",
        background: "rgba(0,0,0,0.015)",
      }}
    >
      {children}
    </div>
  );
}

function RowButton({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 12px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        textAlign: "left", // LTR ثابت
        fontSize: 14,
      }}
    >
      <span style={{ width: 18, textAlign: "center" }}>{checked ? "✓" : ""}</span>
      <span>{label}</span>
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onToggle,
  hint,
  iconSrc,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  hint?: string;
  iconSrc?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {iconSrc && (
          <img
            src={iconSrc}
            alt=""
            width={18}
            height={18}
            style={{ display: "block", opacity: 0.9 }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 14 }}>{label}</span>
          {hint && <span style={{ fontSize: 11, opacity: 0.7 }}>{hint}</span>}
        </div>
      </div>

      <button
        onClick={onToggle}
        aria-pressed={checked}
        style={{
          width: 46,
          height: 26,
          borderRadius: 26,
          border: "1px solid rgba(0,0,0,0.12)",
          background: checked ? "#4caf50" : "#e0e0e0",
          position: "relative",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 22 : 2, // LTR ثابت
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            transition: "left 120ms",
          }}
        />
      </button>
    </div>
  );
}

function ActionRow({
  label,
  onClick,
  disabled,
  iconSrc,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  iconSrc?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!!disabled}
      style={{
        width: "100%",
        padding: "10px 12px",
        background: disabled ? "#f3f3f3" : "#ffffff",
        color: disabled ? "#9e9e9e" : "#1a1a1a",
        border: "none",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left", // LTR ثابت
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      {iconSrc && (
        <img
          src={iconSrc}
          alt=""
          width={18}
          height={18}
          style={{ display: "block", opacity: 0.9 }}
        />
      )}
      <span>{label}</span>
    </button>
  );
}
