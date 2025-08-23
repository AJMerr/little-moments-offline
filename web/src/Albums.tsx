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
  const [newDescription, setNewDescription] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Reset form when hiding
  const toggleCreateForm = () => {
    if (showCreateForm) {
      setNewTitle("");
      setNewDescription("");
    }
    setShowCreateForm(!showCreateForm);
  };

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

  // Debug: log when albums state changes
  useEffect(() => {
    console.log("Albums state changed:", albums);
  }, [albums]);

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
        setNextAlbums(res.next_cursor ?? "");
      } catch (e: any) {
        console.error("Failed to load albums:", e);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  // load more albums
  async function loadMoreAlbums() {
    if (!nextAlbums || loadingList) return;
    setLoadingList(true);
    try {
      const res = await listAlbums(24, nextAlbums);
      setAlbums((cur) => [...cur, ...res.items]);
      setNextAlbums(res.next_cursor ?? "");
    } catch (e: any) {
      console.error("Failed to load more albums:", e);
    } finally {
      setLoadingList(false);
    }
  }

  // create new album
  async function onCreateAlbum() {
    if (!newTitle.trim()) return;
    try {
      const album = await createAlbum({ 
        title: newTitle.trim(),
        description: newDescription.trim() || undefined
      });
      setAlbums((cur) => [album, ...cur]);
      setNewTitle("");
      setNewDescription("");
    } catch (e: any) {
      alert("Failed to create album: " + e?.message);
    }
  }

  // open album detail
  async function onOpenAlbum(id: string) {
    setOpenId(id);
    try {
      const album = await getAlbum(id);
      setDetail(album);
    } catch (e: any) {
      alert("Failed to load album: " + e?.message);
    }
  }

  // close album detail
  function onCloseAlbum() {
    setOpenId(null);
    setDetail(null);
    setNextPhotos("");
  }

  // load more photos in album
  async function loadMorePhotos() {
    if (!detail || !nextPhotos) return;
    try {
      const res = await getAlbum(detail.id, 24, nextPhotos);
      setDetail((cur) => cur ? { ...cur, photos: [...cur.photos, ...res.photos] } : null);
      setNextPhotos(res.next_cursor ?? "");
    } catch (e: any) {
      console.error("Failed to load more photos:", e);
    }
  }

  // save album metadata
  async function onSaveAlbum() {
    if (!detail) return;
    try {
      setSavingMeta(true);
      const updated = await patchAlbum(requireAlbumId(), {
        title: detail.title,
        description: detail.description,
        cover_photo_id: detail.cover_photo_id,
      });
      
      // Update both the detail view and the albums list
      setDetail((cur) => cur ? { ...cur, ...updated } : null);
      setAlbums((cur) => cur.map((album) => 
        album.id === updated.id ? { ...album, ...updated } : album
      ));
      
    } catch (e: any) {
      alert("Failed to update album: " + e?.message);
    } finally {
      setSavingMeta(false);
    }
  }

  // delete album
  async function onDeleteAlbum() {
    if (!detail || !window.confirm("Delete this album?")) return;
    
    // Debug logging to see what's happening
    console.log("Delete album - detail:", detail);
    console.log("Delete album - detail.id:", detail.id);
    console.log("Delete album - openId:", openId);
    console.log("Delete album - albumIdRef.current:", albumIdRef.current);
    
    try {
      // Use the same pattern as other working functions
      const albumId = requireAlbumId();
      console.log("Delete album - using albumId:", albumId);
      
      await deleteAlbum(albumId);
      setAlbums((cur) => cur.filter((a) => a.id !== albumId));
      onCloseAlbum();
    } catch (e: any) {
      console.error("Delete album error:", e);
      alert("Failed to delete album: " + e?.message);
    }
  }

  // open photo picker
  async function onOpenPicker() {
    setPickerOpen(true);
    try {
      const res = await listPhotos(undefined, 100);
      setLibrary(res.items ?? []);
    } catch (e: any) {
      alert("Failed to load photos: " + e?.message);
    }
  }

  // add selected photos to album
  async function onAddPhotos() {
    if (selectedIds.size === 0) return;
    try {
      await addPhotosToAlbum(requireAlbumId(), Array.from(selectedIds));
      // reload album to get updated photo list
      const album = await getAlbum(requireAlbumId());
      setDetail(album);
      setPickerOpen(false);
      setSelectedIds(new Set());
    } catch (e: any) {
      alert("Failed to add photos: " + e?.message);
    }
  }

  // remove photo from album
  async function onRemovePhoto(photoId: string) {
    try {
      await removePhotosFromAlbum(requireAlbumId(), [photoId]);
      setDetail((cur) => cur ? { ...cur, photos: cur.photos.filter((p) => p.id !== photoId) } : null);
    } catch (e: any) {
      alert("Failed to remove photo: " + e?.message);
    }
  }

  // set cover photo
  async function onSetCover(photoId: string) {
    try {
      const updated = await patchAlbum(requireAlbumId(), { cover_photo_id: photoId });
      
      console.log("Setting cover photo - updated album:", updated);
      console.log("Setting cover photo - cover_photo_id:", updated.cover_photo_id);
      
      // Update both the detail view and the albums list
      setDetail((cur) => cur ? { ...cur, ...updated } : null);
      
      // Force a more explicit update of the albums list
      setAlbums((cur) => {
        const newAlbums = cur.map((album) => 
          album.id === updated.id ? { ...album, ...updated } : album
        );
        console.log("Setting cover photo - new albums:", newAlbums);
        return newAlbums;
      });
      
    } catch (e: any) {
      alert("Failed to set cover photo: " + e?.message);
    }
  }

  // album list view
  if (!openId) {
    return (
      <>
        {/* Header with Toggle Button */}
        <div className="flex items-center justify-center mb-8">
          <button
            onClick={toggleCreateForm}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/25"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {showCreateForm ? 'Hide Create Album' : 'Create Album'}
          </button>
        </div>

        {/* Create Album Section */}
                {showCreateForm && (
          <div className="bg-black/40 border border-gray-800 rounded-2xl p-6 mb-8 backdrop-blur-sm">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="w-full min-w-0">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Album Title</label>
                  <input
                    type="text"
                    placeholder="Enter album title..."
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                    onKeyDown={(e) => e.key === "Enter" && onCreateAlbum()}
                  />
                </div>
                <div className="w-full min-w-0 flex flex-col justify-end">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Description (Optional)</label>
                  <input
                    type="text"
                    placeholder="Enter album description..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                  />
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  disabled={!newTitle.trim()}
                  onClick={onCreateAlbum}
                  className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/25 disabled:shadow-none"
                >
                  Create Album
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Albums Grid */}
        {loadingList && albums.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-gray-400">
              <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <span>Loading albums...</span>
            </div>
          </div>
        )}

        {albums.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
            {albums.map((album) => (
              <div
                key={album.id}
                className="group bg-black/40 border border-gray-800 rounded-2xl overflow-hidden transition-all duration-300 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/10 hover:scale-[1.02] cursor-pointer"
                onClick={() => onOpenAlbum(album.id)}
              >
                <div className="relative h-48 bg-gray-800 overflow-hidden">
                  {album.cover_photo_id ? (
                    <LazyImg
                      pid={album.cover_photo_id}
                      alt={album.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-16 h-16 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-lg font-medium text-gray-200 mb-2 truncate" title={album.title}>
                    {album.title}
                  </h3>
                  {album.description && (
                    <p className="text-sm text-gray-400 mb-3 line-clamp-2" title={album.description}>
                      {album.description}
                    </p>
                  )}
                                     <div className="flex items-center justify-between text-xs text-gray-500">
                     <span>{new Date(album.created_at).toLocaleDateString()}</span>
                     <span className="text-purple-400">0 photos</span>
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More Albums */}
        {nextAlbums && (
          <div className="flex justify-center py-12">
            <button
              onClick={loadMoreAlbums}
              disabled={loadingList}
              className="px-8 py-3 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 text-gray-200 font-medium rounded-lg transition-all duration-200 border border-gray-700 hover:border-purple-500/50 disabled:cursor-not-allowed"
            >
              {loadingList ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                  Loading...
                </div>
              ) : (
                "Load More Albums"
              )}
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loadingList && albums.length === 0 && (
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 bg-gray-800 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-gray-300 mb-2">No albums yet</h3>
            <p className="text-gray-500 mb-6">Create your first album to organize your photos</p>
          </div>
        )}
      </>
    );
  }

  // album detail view
  if (!detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          <span>Loading album...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Album Header */}
      <div className="bg-black/40 border border-gray-800 rounded-2xl p-6 mb-8 backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={onCloseAlbum}
                className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors duration-200"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-2xl font-bold text-gray-100">{detail.title}</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
                <input
                  value={detail.title}
                  onChange={(e) => setDetail({ ...detail, title: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={detail.description || ""}
                  onChange={(e) => setDetail({ ...detail, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200 resize-none"
                  placeholder="Add a description..."
                />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <button
              onClick={onOpenPicker}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors duration-200 shadow-lg hover:shadow-purple-500/25"
            >
              Add Photos
            </button>
            <button
              onClick={onSaveAlbum}
              disabled={savingMeta}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 text-gray-200 font-medium rounded-lg transition-colors duration-200"
            >
              {savingMeta ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={onDeleteAlbum}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-colors duration-200"
            >
              Delete Album
            </button>
          </div>
        </div>
      </div>

      {/* Photos Grid */}
      {detail.photos.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
          {detail.photos.map((photo, index) => (
            <div key={photo.id} className="group bg-black/40 border border-gray-800 rounded-2xl overflow-hidden transition-all duration-300 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/10">
              <div className="relative h-48 bg-gray-800 overflow-hidden">
                <LazyImg
                  pid={photo.id}
                  alt={photo.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                
                {/* Photo Actions Overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <div className="flex gap-2">
                    <button
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors duration-200 shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetCover(photo.id);
                      }}
                      title="Set as cover photo"
                    >
                      Cover
                    </button>
                    <button
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors duration-200 shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemovePhoto(photo.id);
                      }}
                      title="Remove from album"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-4">
                <h4 className="text-sm font-medium text-gray-200 mb-2 truncate" title={photo.title}>
                  {photo.title}
                </h4>
                {photo.description && (
                  <p className="text-xs text-gray-400 mb-2 line-clamp-2" title={photo.description}>
                    {photo.description}
                  </p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>#{index + 1}</span>
                  <span className="text-purple-400">{(photo.bytes / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="w-24 h-24 mx-auto mb-6 bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-medium text-gray-300 mb-2">No photos in this album</h3>
          <p className="text-gray-500 mb-6">Add some photos to get started</p>
          <button
            onClick={onOpenPicker}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors duration-200"
          >
            Add Photos
          </button>
        </div>
      )}

      {/* Load More Photos */}
      {nextPhotos && (
        <div className="flex justify-center py-12">
          <button
            onClick={loadMorePhotos}
            className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium rounded-lg transition-all duration-200 border border-gray-700 hover:border-purple-500/50"
          >
            Load More Photos
          </button>
        </div>
      )}

      {/* Photo Picker Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="bg-black border border-gray-800 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-2xl font-bold text-gray-100 mb-2">Add Photos to Album</h3>
              <p className="text-gray-400">Select photos to add to "{detail.title}"</p>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {library.map((photo) => {
                  const isSelected = selectedIds.has(photo.id);
                  const alreadyInAlbum = inAlbum.has(photo.id);
                  
                  return (
                    <div
                      key={photo.id}
                      className={`relative group cursor-pointer ${
                        alreadyInAlbum ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      onClick={() => {
                        if (alreadyInAlbum) return;
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (isSelected) {
                            next.delete(photo.id);
                          } else {
                            next.add(photo.id);
                          }
                          return next;
                        });
                      }}
                    >
                      <div className="relative h-32 bg-gray-800 rounded-lg overflow-hidden">
                        <LazyImg
                          pid={photo.id}
                          alt={photo.title}
                          className="w-full h-full object-cover"
                        />
                        
                        {/* Selection Indicator */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-purple-600/30 flex items-center justify-center">
                            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        )}
                        
                        {/* Already in Album Indicator */}
                        {alreadyInAlbum && (
                          <div className="absolute inset-0 bg-gray-900/70 flex items-center justify-center">
                            <span className="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded">In Album</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-2 text-center">
                        <div className="text-sm text-gray-200 truncate" title={photo.title}>
                          {photo.title}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-6 border-t border-gray-800 flex items-center justify-between">
              <div className="text-sm text-gray-400">
                {selectedIds.size} photo{selectedIds.size !== 1 ? 's' : ''} selected
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setPickerOpen(false)}
                  className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={onAddPhotos}
                  disabled={selectedIds.size === 0}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors duration-200"
                >
                  Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} Photos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
