import { useEffect, useMemo, useRef, useState } from "react";
import {
  listPhotos,
  presign,
  uploadToS3Proxy,
  type PresignRes,
  confirmPhoto,
  photoUrl,
  patchPhoto,
  deletePhoto,
  type Photo,
} from "./api";
import Albums from "./Albums"; 
import "./index.css";

type WithUrl = Photo & { _url?: string; _exp?: number };

export default function App() {
  const [tab, setTab] = useState<"photos" | "albums">("photos");

  const [items, setItems] = useState<WithUrl[]>([]);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null); 
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const [sel, setSel] = useState<WithUrl | null>(null);

  // load first page
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await listPhotos();
        setItems(res.items ?? []);
        setCursor(res.next_cursor ?? "");
      } catch (e: any) {
        setErr(e?.message || "failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // refresh / fetch presigned GET URLs (auto-refresh 5s before expiry)
  useEffect(() => {
    let timers: number[] = [];
    const ensure = async (p: WithUrl, idx: number) => {
      if (p._url && p._exp && p._exp - Date.now() > 10_000) return;
      try {
        const { url, expires_at } = await photoUrl(p.id);
        const exp = new Date(expires_at).getTime();
        setItems((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], _url: url, _exp: exp };
          return next;
        });
        const delay = Math.max(exp - Date.now() - 5000, 10000);
        timers.push(window.setTimeout(() => ensure({ ...p, _url: url, _exp: exp }, idx), delay));
      } catch {}
    };
    items.forEach((p, i) => void ensure(p, i));
    return () => timers.forEach(clearTimeout);
  }, [items]);

  async function loadMore() {
    if (!cursor || loading) return;
    try {
      setLoading(true);
      const res = await listPhotos(cursor);
      setItems((cur) => [...cur, ...(res.items ?? [])]);
      setCursor(res.next_cursor ?? "");
    } catch (e: any) {
      setErr(e?.message || "failed to load more");
    } finally {
      setLoading(false);
    }
  }

  async function onUpload() {
    if (!file) return;
    try {
      setBusy(true);

      const pre: PresignRes = await presign(file.name, file.type);   
      await uploadToS3Proxy(pre.url, file);                          
      const meta = await confirmPhoto(pre.key, file.size, file.type, title || file.name);

      setItems(cur => [meta, ...cur]);
      setFile(null);
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";               
    } catch (e: any) {
      alert(e?.message || "upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this photo?")) return;
    const keep = [...items];
    setItems((cur) => cur.filter((p) => p.id !== id));
    try {
      await deletePhoto(id);
    } catch {
      setItems(keep);
      alert("delete failed");
    }
  }

  async function onSaveSel() {
    if (!sel) return;
    try {
      setBusy(true);
      const updated = await patchPhoto(sel.id, {
        title: sel.title,
        description: sel.description,
      });
      setItems((cur) => cur.map((p) => (p.id === sel.id ? { ...p, ...updated } : p)));
      setSel(null);
    } catch {
      alert("update failed");
    } finally {
      setBusy(false);
    }
  }

  const grid = useMemo(
    () =>
      items.map((p) => (
        <div key={p.id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <button className="block w-full bg-black/50" onClick={() => setSel(p)}>
            {p._url ? (
              <img
                src={p._url}
                alt={p.title || "photo"}
                className="w-full h-56 object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-56 animate-pulse bg-neutral-800" />
            )}
          </button>
          <div className="p-3 flex items-center gap-2">
            <div className="truncate text-sm flex-1" title={p.title || "Untitled"}>
              {p.title || "Untitled"}
            </div>
            <button
              className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
              onClick={() => setSel(p)}
            >
              Open
            </button>
            <button
              className="px-2 py-1 text-xs rounded border border-red-700 text-red-400 hover:bg-red-950/30"
              onClick={() => onDelete(p.id)}
            >
              Delete
            </button>
          </div>
        </div>
      )),
    [items]
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-3xl font-bold">Little Moments</h1>
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              onClick={() => setTab("photos")}
              className={`px-3 py-1.5 rounded-md ${tab === "photos" ? "bg-indigo-600" : "bg-neutral-800"}`}
            >
              Photos
            </button>
            <button
              onClick={() => setTab("albums")}
              className={`px-3 py-1.5 rounded-md ${tab === "albums" ? "bg-indigo-600" : "bg-neutral-800"}`}
            >
              Albums
            </button>
          </div>
        </div>

        {tab === "photos" ? (
          <>
            {loading && <span className="text-sm text-neutral-400">Loading…</span>}

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 mb-4 flex gap-3 items-center">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <input
                type="text"
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-transparent border border-neutral-800"
              />
              <button
                disabled={!file || busy}
                onClick={onUpload}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
              >
                {busy ? "Uploading…" : "Upload"}
              </button>
            </div>

            {err && <div className="text-red-400 mb-3">{err}</div>}

            {/* grid */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
              {grid}
            </div>

            {/* pager */}
            <div className="flex justify-center py-10">
              {cursor ? (
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border border-neutral-800 hover:bg-neutral-900 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              ) : (
                <span className="text-neutral-500">No more</span>
              )}
            </div>

            {sel && (
              <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => setSel(null)}
              >
                <div
                  className="bg-neutral-950 border border-neutral-800 rounded-xl w-full max-w-5xl grid md:grid-cols-2 gap-4 p-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {sel._url && (
                    <img
                      src={sel._url}
                      alt={sel.title}
                      className="w-full max-h-[70vh] object-contain bg-black/50 rounded"
                    />
                  )}

                  <div className="flex flex-col gap-3">
                    <label className="text-sm text-neutral-400">
                      Title
                      <input
                        value={sel.title || ""}
                        onChange={(e) => setSel({ ...sel, title: e.target.value })}
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-transparent border border-neutral-800"
                      />
                    </label>

                    <label className="text-sm text-neutral-400">
                      Description
                      <textarea
                        rows={4}
                        value={sel.description || ""}
                        onChange={(e) => setSel({ ...sel, description: e.target.value })}
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-transparent border border-neutral-800"
                      />
                    </label>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        className="px-3 py-2 rounded-lg border border-neutral-800 hover:bg-neutral-900"
                        onClick={() => setSel(null)}
                      >
                        Close
                      </button>
                      <div className="flex-1" />
                      <button
                        disabled={busy}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                        onClick={onSaveSel}
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <Albums />
        )}
      </div>
    </div>
  );
}
