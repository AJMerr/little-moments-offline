import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Album,
  type AlbumDetail,
  listAlbums,
  createAlbum,
  getAlbum,
  patchAlbum,
  deleteAlbum,
  addPhotosToAlbum,
  removePhotosFromAlbum,
  listPhotos,
  type Photo,
  photoUrl,
} from "./api";

// Small helper: fetch a signed URL and auto-refresh on 403 once
function LazyImg({
  pid,
  alt,
  className,
}: {
  pid: string;
  alt?: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string>("");
  const retried = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { url } = await photoUrl(pid);
      if (alive) setSrc(url);
    })();
    return () => {
      alive = false;
    };
  }, [pid]);

  return (
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      onError={async () => {
        if (retried.current) return;
        retried.current = true;
        const { url } = await photoUrl(pid);
        setSrc(url);
      }}
    />
  );
}

export default function Albums() {
  // list view
  const [albums, setAlbums] = useState<Album[]>([]);
  const [nextAlbums, setNextAlbums] = useState<string>("");
  const [loadingList, setLoadingList] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // detail view
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [nextPhotos, setNextPhotos] = useState<string>("");
  const [savingMeta, setSavingMeta] = useState(false);

  // add photos modal (super simple)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [library, setLibrary] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inAlbum = useMemo(
    () => new Set(detail?.photos.map((p) => p.id) ?? []),
    [detail]
  );

  // keep a stable album id for all handlers (avoids /albums/undefined)
const albumIdRef = useRef<string>("");

// always keep the ref in sync with current selection
useEffect(() => {
  albumIdRef.current = detail?.id ?? openId ?? "";
}, [detail, openId]);

function requireAlbumId(): string {
  const id = albumIdRef.current;
  if (!id) throw new Error("Album not loaded yet");
  return id;
}


  // load first page of albums
  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const res = await listAlbums(24);
        setAlbums(res.items);
        setNextAlbums(res.next_cursor);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  async function loadMoreAlbums() {
    if (!nextAlbums || loadingList) return;
    setLoadingList(true);
    try {
      const res = await listAlbums(24, nextAlbums);
      setAlbums((a) => [...a, ...res.items]);
      setNextAlbums(res.next_cursor);
    } finally {
      setLoadingList(false);
    }
  }

async function onCreateAlbum() {
  const title = newTitle.trim();
  if (!title) return;
  const a = await createAlbum({ title });
  setAlbums((cur) => [a, ...cur]);
  setNewTitle("");
}

async function openAlbum(id: string) {
  setOpenId(id);
  const d = await getAlbum(id, 24);
  setDetail(d);
  setNextPhotos(d.next_cursor);
  albumIdRef.current = d.id;   // extra safety
}

async function loadMorePhotos() {
  if (!nextPhotos) return;
  const id = requireAlbumId();
  const d = await getAlbum(id, 24, nextPhotos);
  setDetail((cur) => (cur ? { ...cur, photos: [...cur.photos, ...d.photos] } : cur));
  setNextPhotos(d.next_cursor);
}

async function saveMeta() {
  if (!detail) return;
  setSavingMeta(true);
  try {
    const id = requireAlbumId();
    const updated = await patchAlbum(id, {
      title: detail.title,
      description: detail.description,
      cover_photo_id: detail.cover_photo_id ?? null,
    });
    setDetail((d) => (d ? { ...d, ...updated, cover_photo_id: updated.cover_photo_id ?? null } : d));
    setAlbums((as) => as.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
  } finally {
    setSavingMeta(false);
  }
}

async function onDeleteAlbum(id: string) {
  if (!confirm("Delete this album?")) return;
  await deleteAlbum(id);
  setAlbums((as) => as.filter((a) => a.id !== id));
  if (openId === id) {
    setOpenId(null);
    setDetail(null);
  }
}

async function setCover(pid: string) {
  if (!detail) return;
  setDetail({ ...detail, cover_photo_id: pid });
  const id = requireAlbumId();
  await patchAlbum(id, { cover_photo_id: pid });
  setAlbums((as) => as.map((a) => (a.id === id ? { ...a, cover_photo_id: pid } : a)));
}

async function removeFromAlbum(pid: string) {
  const id = requireAlbumId();
  await removePhotosFromAlbum(id, [pid]);
  setDetail((d) => (d ? { ...d, photos: d.photos.filter((p) => p.id !== pid) } : d));
}

async function openPicker() {
  setPickerOpen(true);
  if (library.length === 0) {
    const res = await listPhotos(); // first 24 is fine for demo
    setLibrary(res.items ?? []); // your shape is {items,next_cursor}
  }
}

async function addSelected() {
  if (selectedIds.size === 0) return;
  const id = requireAlbumId();
  const ids = Array.from(selectedIds);
  await addPhotosToAlbum(id, ids);
  const picked = library.filter((p) => ids.includes(p.id));
  setDetail((d) => (d ? { ...d, photos: [...picked, ...d.photos] } : d));
  setSelectedIds(new Set());
  setPickerOpen(false);
}

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-8">
      {/* header / create */}
      <div className="flex items-center gap-2">
        <input
          className="flex-1 rounded-md bg-neutral-800 border border-neutral-700 px-3 py-2"
          placeholder="New album title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button
          onClick={onCreateAlbum}
          className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500"
        >
          Create
        </button>
      </div>

      {/* albums grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {albums.map((a) => (
          <div
            key={a.id}
            className={`rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900 ${
              openId === a.id ? "ring-2 ring-indigo-500" : ""
            }`}
          >
            <div
              className="aspect-[4/3] bg-neutral-800 cursor-pointer"
              onClick={() => openAlbum(a.id)}
              title="Open album"
            >
              {a.cover_photo_id ? (
                <LazyImg
                  pid={a.cover_photo_id}
                  className="w-full h-full object-cover"
                  alt={a.title}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-500">
                  No cover
                </div>
              )}
            </div>
            <div className="p-3 flex items-center justify-between">
              <div className="truncate">{a.title || "Untitled"}</div>
              <button
                onClick={() => onDeleteAlbum(a.id)}
                className="text-sm px-2 py-1 rounded bg-red-600 hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {nextAlbums && (
        <div className="flex justify-center">
          <button
            onClick={loadMoreAlbums}
            className="px-3 py-2 rounded-md border border-neutral-700"
            disabled={loadingList}
          >
            {loadingList ? "Loading…" : "Load more albums"}
          </button>
        </div>
      )}

      {/* album detail */}
      {detail && (
        <div className="mt-8 border-t border-neutral-800 pt-6">
          <div className="flex flex-col gap-3 mb-4">
            <input
              className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
              value={detail.title}
              onChange={(e) => setDetail({ ...detail, title: e.target.value })}
              placeholder="Album title"
            />
            <textarea
              className="rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
              value={detail.description ?? ""}
              onChange={(e) =>
                setDetail({ ...detail, description: e.target.value })
              }
              placeholder="Description (optional)"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={saveMeta}
                disabled={savingMeta}
                className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60"
              >
                {savingMeta ? "Saving…" : "Save"}
              </button>
              <button
                onClick={openPicker}
                className="px-3 py-2 rounded-md border border-neutral-700"
              >
                Add photos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {detail.photos.map((p) => (
              <div
                key={p.id}
                className="rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900"
              >
                <div className="aspect-square bg-neutral-800">
                  <LazyImg
                    pid={p.id}
                    className="w-full h-full object-cover"
                    alt={p.title}
                  />
                </div>
                <div className="p-2 flex items-center justify-between">
                  <button
                    onClick={() => setCover(p.id)}
                    className={`text-xs px-2 py-1 rounded ${
                      detail.cover_photo_id === p.id
                        ? "bg-indigo-600"
                        : "bg-neutral-800"
                    }`}
                    title="Set as cover"
                  >
                    Cover
                  </button>
                  <button
                    onClick={() => removeFromAlbum(p.id)}
                    className="text-xs px-2 py-1 rounded bg-red-600"
                    title="Remove from album"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {nextPhotos && (
            <div className="flex justify-center mt-4">
              <button
                onClick={loadMorePhotos}
                className="px-3 py-2 rounded-md border border-neutral-700"
              >
                Load more photos
              </button>
            </div>
          )}
        </div>
      )}

      {/* simple picker */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-4 w-[min(100%,900px)] max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Add photos</h2>
              <button
                className="px-2 py-1 rounded bg-neutral-800"
                onClick={() => {
                  setSelectedIds(new Set());
                  setPickerOpen(false);
                }}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {library.map((p) => {
                const disabled = inAlbum.has(p.id);
                const checked = selectedIds.has(p.id);
                return (
                  <label
                    key={p.id}
                    className={`relative rounded border ${
                      checked ? "border-indigo-500" : "border-neutral-700"
                    } ${disabled ? "opacity-40" : "opacity-100"}`}
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={checked}
                      onChange={(e) => {
                        const s = new Set(selectedIds);
                        if (e.target.checked) s.add(p.id);
                        else s.delete(p.id);
                        setSelectedIds(s);
                      }}
                      className="absolute m-2"
                    />
                    <div className="aspect-square bg-neutral-800 rounded">
                      <LazyImg
                        pid={p.id}
                        className="w-full h-full object-cover rounded"
                      />
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={addSelected}
                disabled={selectedIds.size === 0}
                className="px-3 py-2 rounded-md bg-indigo-600 disabled:opacity-60"
              >
                Add selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
