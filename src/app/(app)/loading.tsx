/** Fallback-Skeleton für OS-Ebene (Portfolio/Optimizer/Einstellungen/Rechenwerk). */
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center" aria-busy>
      <span className="spinner spinner-lg" aria-label="Lädt" />
    </div>
  );
}
