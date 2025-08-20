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

export async function photoUrl(id: string) {
  const { data } = await http.get(`/photos/${id}/url`, { params: { ttl: 300 } });
  return data as { url: string; expires_at: string };
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
