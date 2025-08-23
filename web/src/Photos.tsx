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

type WithUrl = Photo & { _url?: string; _exp?: number };

export default function Photos() {
  const [items, setItems] = useState<WithUrl[]>([]);
  const [cursor, setCursor] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null); 
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  const [viewPhoto, setViewPhoto] = useState<WithUrl | null>(null);
  const [editPhoto, setEditPhoto] = useState<WithUrl | null>(null);

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
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";               
      setShowUploadForm(false); // Close the form after successful upload
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

  async function onSaveEdit() {
    if (!editPhoto) return;
    try {
      setBusy(true);
      const updated = await patchPhoto(editPhoto.id, {
        title: editPhoto.title,
        description: editPhoto.description,
      });
      setItems((cur) => cur.map((p) => (p.id === editPhoto.id ? { ...p, ...updated } : p)));
      setEditPhoto(null);
    } catch {
      alert("update failed");
    } finally {
      setBusy(false);
    }
  }

  const grid = useMemo(
    () =>
      items.map((p) => (
        <div key={p.id} className="group bg-black/40 border border-gray-800 rounded-2xl overflow-hidden transition-all duration-300 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/10 hover:scale-[1.02]">
          <button className="block w-full bg-black/50 relative overflow-hidden" onClick={() => setViewPhoto(p)}>
            {p._url ? (
              <img
                src={p._url}
                alt={p.title || "photo"}
                className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-64 animate-pulse bg-gray-800" />
            )}
            {/* Overlay with actions */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors duration-200 shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditPhoto(p);
                  }}
                >
                  Edit
                </button>
                <button
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors duration-200 shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </button>
          <div className="p-4">
            <div className="text-sm font-medium text-gray-200 mb-2 truncate" title={p.title || "Untitled"}>
              {p.title || "Untitled"}
            </div>
            {p.description && (
              <div className="text-xs text-gray-400 mb-3 line-clamp-2" title={p.description}>
                {p.description}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{new Date(p.created_at).toLocaleDateString()}</span>
              <span className="text-purple-400">{(p.bytes / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          </div>
        </div>
      )),
    [items]
  );

  return (
    <>
      {/* Header with Upload Toggle Button */}
      <div className="flex justify-center mb-8">
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/25 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {showUploadForm ? "Hide Upload Form" : "Upload New Photo"}
        </button>
      </div>

      {/* Collapsible Upload Section */}
      {showUploadForm && (
        <div className="bg-black/40 border border-gray-800 rounded-2xl p-6 mb-8 backdrop-blur-sm">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="w-full min-w-0">
                <label className="block text-sm font-medium text-gray-300 mb-2">Upload Photo</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-purple-600 file:text-white hover:file:bg-purple-500 transition-colors duration-200"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="w-full min-w-0">
                <label className="block text-sm font-medium text-gray-300 mb-2">Title (Optional)</label>
                <input
                  type="text"
                  placeholder="Enter a title for your photo..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                />
              </div>
            </div>
            
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-300 mb-2">Description (Optional)</label>
              <textarea
                placeholder="Add a description for your photo..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200 resize-none"
              />
            </div>
            
            <div className="flex justify-end">
              <button
                disabled={!file || busy}
                onClick={onUpload}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/25 disabled:shadow-none"
              >
                {busy ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading...
                  </div>
                ) : (
                  "Upload Photo"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {err && (
        <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-6">
          {err}
        </div>
      )}

      {/* Loading State */}
      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-gray-400">
            <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
            <span>Loading your photos...</span>
          </div>
        </div>
      )}

      {/* Photo Grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6 mb-8">
          {grid}
        </div>
      )}

      {/* Load More Button */}
      {cursor && (
        <div className="flex justify-center py-12">
          <button
            onClick={loadMore}
            disabled={loading}
            className="px-8 py-3 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 text-gray-200 font-medium rounded-lg transition-all duration-200 border border-gray-700 hover:border-purple-500/50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                Loading...
              </div>
            ) : (
              "Load More Photos"
            )}
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && items.length === 0 && !err && (
        <div className="text-center py-20">
          <div className="w-24 h-24 mx-auto mb-6 bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-medium text-gray-300 mb-2">No photos yet</h3>
          <p className="text-gray-500 mb-6">Upload your first photo to get started</p>
          <button
            onClick={() => setShowUploadForm(true)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-all duration-200"
          >
            Upload Photo
          </button>
        </div>
      )}

      {/* Photo View Modal */}
      {viewPhoto && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setViewPhoto(null)}
        >
          <div
            className="bg-black border border-gray-800 rounded-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-gray-100">{viewPhoto.title || "Untitled"}</h3>
                {viewPhoto.description && (
                  <p className="text-gray-400 mt-1">{viewPhoto.description}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setEditPhoto(viewPhoto);
                    setViewPhoto(null);
                  }}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors duration-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => setViewPhoto(null)}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg transition-colors duration-200"
                >
                  Close
                </button>
              </div>
            </div>
            
            <div className="p-6 flex items-center justify-center">
              {viewPhoto._url && (
                <img
                  src={viewPhoto._url}
                  alt={viewPhoto.title}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              )}
            </div>
            
            <div className="p-6 border-t border-gray-800 bg-gray-900/30">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-400">
                <div>
                  <span className="font-medium text-gray-300">Uploaded:</span>
                  <span className="ml-2">{new Date(viewPhoto.created_at).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-300">File Size:</span>
                  <span className="ml-2">{(viewPhoto.bytes / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <div>
                  <span className="font-medium text-gray-300">Type:</span>
                  <span className="ml-2">{viewPhoto.content_type}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Edit Modal */}
      {editPhoto && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setEditPhoto(null)}
        >
          <div
            className="bg-black border border-gray-800 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid lg:grid-cols-2 gap-0">
              {/* Image Preview */}
              <div className="bg-black p-6 flex items-center justify-center">
                {editPhoto._url && (
                  <img
                    src={editPhoto._url}
                    alt={editPhoto.title}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg"
                  />
                )}
              </div>

              {/* Edit Form */}
              <div className="p-8 bg-gray-900/50">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-gray-100 mb-2">Edit Photo</h3>
                  <p className="text-gray-400">Update your photo details</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Title
                    </label>
                    <input
                      value={editPhoto.title || ""}
                      onChange={(e) => setEditPhoto({ ...editPhoto, title: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                      placeholder="Enter photo title..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      rows={4}
                      value={editPhoto.description || ""}
                      onChange={(e) => setEditPhoto({ ...editPhoto, description: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200 resize-none"
                      placeholder="Add a description..."
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <button
                      className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg transition-colors duration-200"
                      onClick={() => setEditPhoto(null)}
                    >
                      Cancel
                    </button>
                    <div className="flex-1" />
                    <button
                      disabled={busy}
                      className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200"
                      onClick={onSaveEdit}
                    >
                      {busy ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Saving...
                        </div>
                      ) : (
                        "Save Changes"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
