/**
 * Sofort-Feedback beim Tab-Wechsel (D69): das Skeleton erscheint OHNE
 * Wartezeit im Content-Bereich (Sidebar bleibt stehen), während der
 * Server die Daten lädt. Shimmer im CI-Look, keine Fake-Inhalte.
 */
export default function Loading() {
  return (
    <main className="w-full p-8" aria-busy>
      <div className="skeleton h-8 w-56" />
      <div className="skeleton mt-2 h-4 w-96 max-w-full" />
      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="skeleton h-44 lg:col-span-2" />
        <div className="skeleton h-44" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-24" />)}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="skeleton h-64" />
        <div className="skeleton h-64" />
      </div>
    </main>
  );
}
