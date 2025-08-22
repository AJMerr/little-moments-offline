import { http } from "./http";
import axios from "axios";

export const API = import.meta.env.VITE_API_BASE as string;

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
  const params: any = { limit };
  if (cursor) params.cursor = cursor;
  const { data } = await http.get("/photos", { params });
  return data as { items: Photo[]; next_cursor?: string };
}

export async function presign(filename: string, contentType: string) {
  const { data } = await http.post("/photos/presign", {
    filename,
    content_type: contentType,
  });
  return data as { url: string; key: string; headers: Record<string, string> };
}

export async function confirmPhoto(
  key: string,
  bytes: number,
  contentType: string,
  title: string
) {
  const { data } = await http.post("/photos/confirm", {
    key,
    bytes,
    content_type: contentType,
    title,
  });
  return data as Photo;
}

function toS3Proxy(url: string) {
  const u = new URL(url);
  return `${window.location.origin}/s3${u.pathname}${u.search}`;
}

export async function photoUrl(id: string) {
  const { data } = await http.get<{ url: string; expires_at: string }>(
    `/photos/${id}/url`,
    { params: { ttl: 300 } }
  );
  return {
    url: toS3Proxy(data.url),   
    expires_at: data.expires_at 
  };
}

export async function patchPhoto(
  id: string,
  patch: { title?: string; description?: string }
) {
  const { data } = await http.patch(`/photos/${id}`, patch); 
  return data as Photo;
}

export async function deletePhoto(id: string) {
  await http.delete(`/photos/${id}`);
}

/** Upload file to presigned S3 URL via Axios */
export async function uploadToS3(url: string, file: File, contentType: string) {
  await axios.put(url, file, {
    headers: { "Content-Type": contentType },
  });
}

// api.ts
export async function uploadToS3Proxy(presignedUrl: string, file: File) {
  const u = new URL(presignedUrl);
  const proxied = `${window.location.origin}/s3${u.pathname}${u.search}`;
  const ct = file.type || 'application/octet-stream';
  await fetch(proxied, { method: 'PUT', headers: { 'Content-Type': ct }, body: file });
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
  const params: any = { limit };
  if (cursor) params.cursor = cursor;
  const { data } = await http.get("/albums", { params });
  return data as AlbumList;
}

export async function createAlbum(payload: {
  title: string;
  description?: string;
  photo_ids?: string[];
  cover_photo_id?: string;
}) {
  const { data } = await http.post("/albums", payload);
  return data as Album;
}

export async function getAlbum(
  id: string,
  limit = 24,
  cursor?: string
): Promise<AlbumDetail> {
  const params: any = { limit };
  if (cursor) params.cursor = cursor;
  const { data } = await http.get(`/albums/${id}`, { params });
  // server returns { id,title,description,cover_photo_id,created_at,photos,next_cursor }
  return data as AlbumDetail;
}

export async function patchAlbum(
  albumId: string,
  body: { title?: string; description?: string; cover_photo_id?: string | null }
) {
  if (!albumId) throw new Error('patchAlbum: missing albumId');
  const r = await fetch(`${API}/albums/${albumId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('patch album failed');
  return r.json() as Promise<Album>;
}

export async function deleteAlbum(id: string) {
  await http.delete(`/albums/${id}`);
}

export async function addPhotosToAlbum(id: string, photo_ids: string[]) {
  const { data } = await http.post(`/albums/${id}/photos`, { photo_ids });
  return data as { added: number };
}

export async function removePhotosFromAlbum(id: string, photo_ids: string[]) {
  const { data } = await http.delete(`/albums/${id}/photos`, {
    data: { photo_ids },
  });
  return data as { removed: number };
}