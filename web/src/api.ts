import axios from "axios";

export const API = import.meta.env.VITE_API_BASE as string;

// Simple request deduplication to prevent duplicate API calls
const pendingRequests = new Map<string, Promise<any>>();

function deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!;
  }
  
  const promise = requestFn().finally(() => {
    pendingRequests.delete(key);
  });
  
  pendingRequests.set(key, promise);
  return promise;
}

export type Photo = {
  id: string;
  title: string;
  description: string;
  origin_key: string;
  content_type: string;
  bytes: number;
  created_at: string;
};

export type PresignRes = {
  url: string;                 // presigned URL from /photos/presign
  key: string;                 // object key (you already use this in confirm)
  headers?: Record<string, string>; // e.g. { "Content-Type": "image/jpeg" }
};

export async function listPhotos(cursor?: string, limit = 24) {
  try {
    const params: any = { limit };
    if (cursor) params.cursor = cursor;
    const { data } = await axios.get(`${API}/photos`, { params });
    return data as { items: Photo[]; next_cursor?: string };
  } catch (error: any) {
    throw new Error(`Failed to load photos: ${error.response?.data?.message || error.message}`);
  }
}

export async function presign(filename: string, contentType: string) {
  try {
    const { data } = await axios.post(`${API}/photos/presign`, {
      filename,
      content_type: contentType,
    });
    return data as { url: string; key: string; headers: Record<string, string> };
  } catch (error: any) {
    throw new Error(`Failed to get presigned URL: ${error.response?.data?.message || error.message}`);
  }
}

export async function confirmPhoto(
  key: string,
  bytes: number,
  contentType: string,
  title: string,
  description?: string
) {
  try {
    const { data } = await axios.post(`${API}/photos/confirm`, {
      key,
      bytes,
      content_type: contentType,
      title,
    });
    
    // If description is provided, update the photo with it
    if (description && description.trim()) {
      const updatedPhoto = await patchPhoto(data.id, { description: description.trim() });
      return updatedPhoto;
    }
    
    return data as Photo;
  } catch (error: any) {
    throw new Error(`Failed to confirm photo: ${error.response?.data?.message || error.message}`);
  }
}

function toS3Proxy(url: string) {
  const u = new URL(url);
  return `${window.location.origin}/s3${u.pathname}${u.search}`;
}

export async function photoUrl(id: string) {
  return deduplicateRequest(`photoUrl:${id}`, async () => {
    try {
      const { data } = await axios.get<{ url: string; expires_at: string }>(
        `${API}/photos/${id}/url`,
        { params: { ttl: 300 } }
      );
      return {
        url: toS3Proxy(data.url),   
        expires_at: data.expires_at 
      };
    } catch (error: any) {
      throw new Error(`Failed to get photo URL: ${error.response?.data?.message || error.message}`);
    }
  });
}

export async function patchPhoto(
  id: string,
  patch: { title?: string; description?: string }
) {
  try {
    const { data } = await axios.patch(`${API}/photos/${id}`, patch); 
    return data as Photo;
  } catch (error: any) {
    throw new Error(`Failed to update photo: ${error.response?.data?.message || error.message}`);
  }
}

export async function deletePhoto(id: string) {
  try {
    await axios.delete(`${API}/photos/${id}`);
  } catch (error: any) {
    throw new Error(`Failed to delete photo: ${error.response?.data?.message || error.message}`);
  }
}

/** Upload file to presigned S3 URL with proxy support */
export async function uploadToS3(presignedUrl: string, file: File) {
  try {
    const u = new URL(presignedUrl);
    const proxied = `${window.location.origin}/s3${u.pathname}${u.search}`;
    const contentType = file.type || 'application/octet-stream';
    
    await axios.put(proxied, file, {
      headers: { 'Content-Type': contentType },
      timeout: 60000, // 60 second timeout for uploads
    });
  } catch (error: any) {
    throw new Error(`Upload failed: ${error.response?.data?.message || error.message}`);
  }
}

export async function removePhotosFromAlbum(id: string, photo_ids: string[]) {
  try {
    const { data } = await axios.delete(`${API}/albums/${id}/photos`, {
      data: { photo_ids },
    });
    return data as { removed: number };
  } catch (error: any) {
    throw new Error(`Failed to remove photos from album: ${error.response?.data?.message || error.message}`);
  }
}

// --- Albums types ---
export type Album = {
  id: string;
  title: string;
  description: string;
  cover_photo_id?: string | null;
  created_at: string; // ISO string from API
};

export type AlbumList = { items: Album[]; next_cursor: string };

export type AlbumDetail = Album & {
  photos: Photo[];
  next_cursor: string;
};

// --- Albums API ---
export async function listAlbums(limit = 24, cursor?: string) {
  try {
    const params: any = { limit };
    if (cursor) params.cursor = cursor;
    const { data } = await axios.get(`${API}/albums`, { params });
    return data as AlbumList;
  } catch (error: any) {
    throw new Error(`Failed to load albums: ${error.response?.data?.message || error.message}`);
  }
}

export async function createAlbum(payload: {
  title: string;
  description?: string;
  photo_ids?: string[];
  cover_photo_id?: string;
}) {
  try {
    const { data } = await axios.post(`${API}/albums`, payload);
    return data as Album;
  } catch (error: any) {
    throw new Error(`Failed to create album: ${error.response?.data?.message || error.message}`);
  }
}

export async function getAlbum(
  id: string,
  limit = 24,
  cursor?: string
): Promise<AlbumDetail> {
  try {
    const params: any = { limit };
    if (cursor) params.cursor = cursor;
    const { data } = await axios.get(`${API}/albums/${id}`, { params });
    // server returns { id,title,description,cover_photo_id,created_at,photos,next_cursor }
    return data as AlbumDetail;
  } catch (error: any) {
    throw new Error(`Failed to load album: ${error.response?.data?.message || error.message}`);
  }
}

export async function patchAlbum(
  albumId: string,
  body: { title?: string; description?: string; cover_photo_id?: string | null }
) {
  if (!albumId) throw new Error('patchAlbum: missing albumId');
  try {
    const { data } = await axios.patch(`${API}/albums/${albumId}`, body);
    return data as Album;
  } catch (error: any) {
    throw new Error(`Failed to update album: ${error.response?.data?.message || error.message}`);
  }
}

export async function deleteAlbum(id: string) {
  try {
    await axios.delete(`${API}/albums/${id}`);
  } catch (error: any) {
    throw new Error(`Failed to delete album: ${error.response?.data?.message || error.message}`);
  }
}

export async function addPhotosToAlbum(id: string, photo_ids: string[]) {
  try {
    const { data } = await axios.post(`${API}/albums/${id}/photos`, { photo_ids });
    return data as { added: number };
  } catch (error: any) {
    throw new Error(`Failed to add photos to album: ${error.response?.data?.message || error.message}`);
  }
}