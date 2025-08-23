import { useState } from "react";
import Photos from "./Photos";
import Albums from "./Albums"; 
import "./index.css";

export default function App() {
  const [tab, setTab] = useState<"photos" | "albums">("photos");

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

        {tab === "photos" ? <Photos /> : <Albums />}
      </div>
    </div>
  );
}
