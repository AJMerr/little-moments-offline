import { useState } from "react";
import Photos from "./Photos";
import Albums from "./Albums"; 
import "./index.css";

export default function App() {
  const [tab, setTab] = useState<"photos" | "albums">("photos");

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-100 to-gray-300 bg-clip-text text-transparent">
                Little Moments
              </h1>
              <p className="text-sm text-gray-500">Your private photo sanctuary</p>
            </div>
          </div>
          
          <div className="flex-1" />
          
          {/* Tab Navigation */}
          <div className="flex gap-1 bg-gray-900/50 p-1 rounded-xl border border-gray-800 backdrop-blur-sm">
            <button
              onClick={() => setTab("photos")}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                tab === "photos" 
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/25" 
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              Photos
            </button>
            <button
              onClick={() => setTab("albums")}
              className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                tab === "albums" 
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/25" 
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              Albums
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-[600px]">
          {tab === "photos" ? <Photos /> : <Albums />}
        </div>
      </div>
    </div>
  );
}
