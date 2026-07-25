/**
 * Inline-SVG-Icon-Set (Outline, 1,6px Stroke) — keine externe Abhängigkeit,
 * ein Stil überall (Premium-CI). Größe via className (Default 18px).
 */

type P = { className?: string };
const S = ({ className = "h-[18px] w-[18px]", children }: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);

export const IconCockpit = (p: P) => (
  <S {...p}><rect x="3" y="3" width="7.5" height="10" rx="2" /><rect x="13.5" y="3" width="7.5" height="6" rx="2" /><rect x="13.5" y="12.5" width="7.5" height="8.5" rx="2" /><rect x="3" y="16.5" width="7.5" height="4.5" rx="2" /></S>
);
export const IconKatalog = (p: P) => (
  <S {...p}><path d="M21 8.2 12 3 3 8.2v7.6L12 21l9-5.2z" /><path d="M3.3 8.4 12 13.4l8.7-5" /><path d="M12 21v-7.6" /></S>
);
export const IconSichtbarkeit = (p: P) => (
  <S {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></S>
);
export const IconAds = (p: P) => (
  <S {...p}><path d="m4 11 12-6v14L4 13v-2Z" /><path d="M4 11H3a1 1 0 0 0-1 1v0a1 1 0 0 0 1 1h1" /><path d="M9 14.5V18a1.5 1.5 0 0 0 3 0v-2.4" /><path d="M19.5 9.5 21 8m-1.5 4H22m-2.5 2.5L21 16" /></S>
);
export const IconBerichte = (p: P) => (
  <S {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 15.5v-4M12 15.5v-7M16 15.5v-2.5" /></S>
);
export const IconFlatfile = (p: P) => (
  <S {...p}><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5l-5-5Z" /><path d="M14 3.5V8.5h5" /><path d="M12 11v6m0 0-2.4-2.4M12 17l2.4-2.4" /></S>
);
export const IconHandlungen = (p: P) => (
  <S {...p}><path d="m4 6.5 1.5 1.5L8 5.5" /><path d="m4 12.5 1.5 1.5L8 11.5" /><path d="m4 18.5 1.5 1.5L8 17.5" /><path d="M11.5 7h9M11.5 13h9M11.5 19h9" /></S>
);
export const IconCms = (p: P) => (
  <S {...p}><rect x="3.5" y="3.5" width="17" height="12" rx="2.5" /><path d="M7 7.5h6M7 11h9" /><path d="m8 19.5 2 2 4.5-4.5" /></S>
);
export const IconFeedback = (p: P) => (
  <S {...p}><path d="M20.5 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.3-4.4A7.5 7.5 0 1 1 20.5 12.5Z" /><path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" /></S>
);
export const IconSettings = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" /></S>
);
export const IconLogout = (p: P) => (
  <S {...p}><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></S>
);
export const IconUpload = (p: P) => (
  <S {...p}><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" /></S>
);
export const IconSparkle = (p: P) => (
  <S {...p}><path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9 12 3.5Z" /><path d="M19 3.5v3M20.5 5h-3" /></S>
);
export const IconArrowRight = (p: P) => (
  <S {...p}><path d="M4.5 12h15m0 0-6-6m6 6-6 6" /></S>
);
export const IconEuro = (p: P) => (
  <S {...p}><path d="M18 6.8A7.3 7.3 0 0 0 6.6 9.6 7.4 7.4 0 0 0 6.6 14.4 7.3 7.3 0 0 0 18 17.2" /><path d="M4 10.5h9M4 13.5h9" /></S>
);
export const IconUsers = (p: P) => (
  <S {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0" /><path d="M16 5.1a3.5 3.5 0 0 1 0 5.8" /><path d="M17.8 14.6a6.2 6.2 0 0 1 3.4 4.9" /></S>
);
export const IconSearch = (p: P) => (
  <S {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></S>
);
export const IconCheck = (p: P) => (
  <S {...p}><path d="m4.5 12.5 5 5 10-11" /></S>
);
export const IconContent = (p: P) => (
  <S {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" /></S>
);
export const IconReviews = (p: P) => (
  <S {...p}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.3-.7L3 20.5l1.3-5.7A8.4 8.4 0 1 1 21 11.5Z" /><path d="M8 10.5h8M8 14h5" /></S>
);
