import React, { useState, useEffect } from "react";
import { auth } from "../firebase";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Image as ImageIcon, Mic, FileText, X, Plus, User, Calendar, MapPin, Loader2 } from "lucide-react";
import { cn, api } from "../lib/utils";

export default function FamilyDashboard() {
  const [memories, setMemories] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadType, setUploadType] = useState<"photo" | "voice" | "story">("photo");
  const [linkedPatientId, setLinkedPatientId] = useState<string | null>(null);
  const [patientIdInput, setPatientIdInput] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [formData, setFormData] = useState({
    people: "",
    occasion: "",
    year: "",
    location: "",
    transcript: "",
  });

  const fetchLinkedPatient = async () => {
    if (!auth.currentUser) return;
    try {
      const res = await fetch(api(`/api/link-patient/${auth.currentUser.uid}`));
      if (res.ok) {
        const data = await res.json();
        setLinkedPatientId(data.linkedPatientId || null);
      }
    } catch {}
  };

  const handleLinkPatient = async () => {
    if (!auth.currentUser || !patientIdInput.trim()) return;
    setLinkLoading(true);
    setLinkError("");
    try {
      const res = await fetch(api("/api/link-patient"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyUid: auth.currentUser.uid, patientUid: patientIdInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setLinkError(data.error || "Failed to link"); return; }
      setLinkedPatientId(patientIdInput.trim());
      setPatientIdInput("");
    } catch {
      setLinkError("Network error");
    } finally {
      setLinkLoading(false);
    }
  };

  const fetchMemories = async () => {
    if (!auth.currentUser) return;
    try {
      const response = await fetch(api(`/api/memories?authorId=${auth.currentUser.uid}`));
      if (response.ok) {
        const data = await response.json();
        setMemories(data);
      }
    } catch (error) {
      console.error("Failed to fetch memories:", error);
    }
  };

  const [voices, setVoices] = useState<any[]>([]);
  const [cloning, setCloning] = useState(false);

  const fetchVoices = async () => {
    try {
      const response = await fetch(api("/api/voices"));
      if (response.ok) {
        const data = await response.json();
        setVoices(data);
      }
    } catch (error) {
      console.error("Failed to fetch voices:", error);
    }
  };

  useEffect(() => {
    fetchMemories();
    fetchVoices();
    fetchLinkedPatient();
  }, [auth.currentUser]);

  const cloneVoice = async (memory: any) => {
    if (!memory.people?.[0]) return;
    setCloning(true);
    try {
      // Try OmniVoice first (stores Cloudinary URL as voice_id for zero-shot cloning)
      let response = await fetch(api("/api/omnivoice-clone"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: memory.people[0], sampleUrl: memory.file_url }),
      });
      // Fall back to ElevenLabs if OmniVoice service is not running
      if (!response.ok) {
        response = await fetch(api("/api/clone-voice"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: memory.people[0], sampleUrl: memory.file_url }),
        });
      }
      if (response.ok) fetchVoices();
    } catch (error) {
      console.error(error);
    } finally {
      setCloning(false);
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!auth.currentUser) {
      console.error("Please sign in to upload memories.");
      return;
    }
    
    setUploading(true);
    try {
      let url = "";
      if (uploadType !== "story") {
        const file = acceptedFiles[0];
        if (!file) {
          console.error("No file selected. Please try again.");
          setUploading(false);
          return;
        }
        
        console.log(`Starting upload for ${file.name}...`);
        const formPayload = new FormData();
        formPayload.append("file", file);
        formPayload.append("upload_preset", import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
        const cloudRes = await fetch(
          `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/auto/upload`,
          { method: "POST", body: formPayload }
        );
        if (!cloudRes.ok) throw new Error("Cloudinary upload failed");
        const cloudData = await cloudRes.json();
        url = cloudData.secure_url;
        console.log("Upload successful, URL:", url);
      }

      console.log("Saving to Neon PostgreSQL...");
      const response = await fetch(api("/api/memories"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: uploadType,
          fileUrl: url,
          transcript: formData.transcript,
          tags: {
            people: formData.people.split(",").map((p) => p.trim()).filter(p => p !== ""),
            occasion: formData.occasion,
            year: formData.year,
            location: formData.location,
          },
          authorId: auth.currentUser.uid,
          patientId: linkedPatientId || "default-patient",
        }),
      });

      if (!response.ok) throw new Error("Failed to save to database");

      await fetchMemories();
      setShowUploadModal(false);
      setFormData({ people: "", occasion: "", year: "", location: "", transcript: "" });
      console.log("Memory saved successfully!");
    } catch (error: any) {
      console.error("Detailed upload error:", error);
      console.error(`Failed to save memory: ${error.message || "Unknown error"}.`);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: (uploadType === "photo" ? { "image/*": [] } : uploadType === "voice" ? { "audio/*": [] } : undefined) as any,
    multiple: false,
  } as any);

  return (
    <div className="min-h-screen bg-bg px-4 sm:px-8 py-6 sm:py-8 font-sans">
      <header className="max-w-6xl mx-auto flex flex-wrap gap-4 justify-between items-center mb-8 sm:mb-12">
        <div>
          <h1 className="text-2xl sm:text-4xl font-serif font-medium text-ink tracking-tight">MemoryMirror</h1>
          <p className="text-muted mt-1 sm:mt-2 text-sm italic">Preserving the moments that matter most.</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="bg-ink text-bg px-4 sm:px-6 py-2.5 sm:py-3 rounded-full flex items-center gap-2 hover:bg-opacity-90 transition-all shadow-lg hover:scale-105 active:scale-95 text-sm sm:text-base"
        >
          <Plus size={18} />
          <span>Add New Memory</span>
        </button>
      </header>

      {/* Link Patient Banner */}
      <div className="max-w-6xl mx-auto mb-8 sm:mb-10">
        {linkedPatientId ? (
          <div className="flex items-center justify-between bg-white/75 dark:bg-white/10 backdrop-blur-md glass-border shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:shadow-none rounded-2xl px-6 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted mb-1">Linked Patient</p>
              <p className="text-sm font-mono text-ink">{linkedPatientId}</p>
            </div>
            <button
              onClick={() => { setLinkedPatientId(null); setPatientIdInput(""); }}
              className="text-xs text-muted hover:text-ink underline underline-offset-2"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="bg-white/75 dark:bg-white/10 backdrop-blur-md glass-border shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:shadow-none rounded-2xl px-6 py-5">
            <p className="text-sm font-medium text-ink mb-1">Link a Patient Account</p>
            <p className="text-xs text-muted mb-4">Ask the patient to sign in and share their User ID from their profile page. Paste it below so your memories are shared with them.</p>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Patient's User ID"
                className="flex-1 bg-surface border border-border-color rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-ink outline-none text-ink font-mono"
                value={patientIdInput}
                onChange={(e) => setPatientIdInput(e.target.value)}
              />
              <button
                onClick={handleLinkPatient}
                disabled={linkLoading || !patientIdInput.trim()}
                className="bg-ink text-bg px-5 py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
              >
                {linkLoading ? "Linking..." : "Link"}
              </button>
            </div>
            {linkError && <p className="text-red-500 text-xs mt-2">{linkError}</p>}
          </div>
        )}
      </div>

      <main className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-8">
          <AnimatePresence>
            {memories.map((memory, index) => (
              <motion.div
                key={memory.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/75 dark:bg-white/10 backdrop-blur-md rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:shadow-none hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)] dark:hover:shadow-none transition-all glass-border group"
              >
                {memory.type === "photo" ? (
                  <div className="aspect-[4/3] relative overflow-hidden">
                    <img
                      src={memory.file_url}
                      alt="Memory"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-4 left-4 bg-surface/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 text-ink">
                      <ImageIcon size={12} />
                      <span>Photo</span>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-[4/3] bg-bg flex flex-col items-center justify-center relative gap-4">
                    {memory.type === "voice" ? (
                      <>
                        <Mic size={48} className="text-muted" />
                        <button 
                          onClick={() => cloneVoice(memory)}
                          disabled={cloning}
                          className="bg-ink text-bg px-4 py-1.5 rounded-full text-[10px] uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50"
                        >
                          {cloning ? "Cloning..." : "Clone Voice"}
                        </button>
                      </>
                    ) : (
                      <FileText size={48} className="text-muted" />
                    )}
                    <div className="absolute top-4 left-4 bg-surface/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 text-ink">
                      {memory.type === "voice" ? <Mic size={12} /> : <FileText size={12} />}
                      <span className="capitalize">{memory.type}</span>
                    </div>
                  </div>
                )}
                <div className="p-6">
                  <h3 className="text-xl font-serif font-medium text-ink mb-4">
                    {memory.occasion || "A Special Moment"}
                  </h3>
                  <div className="space-y-2">
                    {memory.people?.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <User size={14} />
                        <span>{memory.people.join(", ")}</span>
                      </div>
                    )}
                    {memory.year && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Calendar size={14} />
                        <span>{memory.year}</span>
                      </div>
                    )}
                    {memory.location && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <MapPin size={14} />
                        <span>{memory.location}</span>
                      </div>
                    )}
                  </div>
                  {memory.transcript && (
                    <p className="mt-4 text-sm text-muted line-clamp-2 italic">
                      "{memory.transcript}"
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {voices.length > 0 && (
          <div className="mt-20 mb-12">
            <h2 className="text-3xl font-serif font-medium text-ink mb-8">Family Voices</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
              {voices.map((voice) => (
                <motion.div 
                  key={voice.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white/75 dark:bg-white/10 backdrop-blur-md p-6 rounded-[32px] glass-border shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:shadow-none flex flex-col items-center gap-4"
                >
                  <div className="w-16 h-16 bg-bg rounded-full flex items-center justify-center text-2xl font-serif text-ink border border-border-color">
                    {voice.person_name[0]}
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-ink">{voice.person_name}</p>
                    <p className="text-[10px] text-muted uppercase tracking-widest mt-1">Voice Ready</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUploadModal(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white/75 dark:bg-white/10 backdrop-blur-md w-full sm:max-w-2xl rounded-t-[40px] sm:rounded-[40px] shadow-2xl dark:shadow-none relative z-10 overflow-y-auto max-h-[95vh] glass-border"
            >
              <div className="p-5 sm:p-8">
                <div className="flex justify-between items-center mb-6 sm:mb-8">
                  <h2 className="text-2xl sm:text-3xl font-serif font-medium text-ink">Add a Memory</h2>
                  <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-bg rounded-full transition-colors text-ink">
                    <X size={24} />
                  </button>
                </div>

                <div className="flex gap-4 mb-8">
                  {(["photo", "voice", "story"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setUploadType(type)}
                      className={cn(
                        "flex-1 py-3 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-2",
                        uploadType === type ? "bg-ink text-bg shadow-lg" : "bg-bg text-muted hover:bg-surface border border-border-color"
                      )}
                    >
                      {type === "photo" && <ImageIcon size={18} />}
                      {type === "voice" && <Mic size={18} />}
                      {type === "story" && <FileText size={18} />}
                      <span className="capitalize">{type}</span>
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 block">Who is in this?</label>
                      <input
                        type="text"
                        placeholder="e.g. Mom, Dad, Sarah"
                        className="w-full bg-surface border border-border-color rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-ink outline-none text-ink"
                        value={formData.people}
                        onChange={(e) => setFormData({ ...formData, people: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 block">What was the occasion?</label>
                      <input
                        type="text"
                        placeholder="e.g. 60th Birthday"
                        className="w-full bg-surface border border-border-color rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-ink outline-none text-ink"
                        value={formData.occasion}
                        onChange={(e) => setFormData({ ...formData, occasion: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 block">When was this?</label>
                      <input
                        type="text"
                        placeholder="e.g. Summer 2005"
                        className="w-full bg-surface border border-border-color rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-ink outline-none text-ink"
                        value={formData.year}
                        onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 block">Where was this?</label>
                      <input
                        type="text"
                        placeholder="e.g. The Lake House"
                        className="w-full bg-surface border border-border-color rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-ink outline-none text-ink"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-8">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted mb-1.5 block">Description or Story</label>
                  <textarea
                    placeholder="Tell us more about this memory..."
                    className="w-full bg-surface border border-border-color rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-ink outline-none h-32 resize-none text-ink"
                    value={formData.transcript}
                    onChange={(e) => setFormData({ ...formData, transcript: e.target.value })}
                  />
                </div>

                {uploadType !== "story" && (
                  <div
                    {...getRootProps()}
                    className={cn(
                      "border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center transition-all cursor-pointer",
                      isDragActive ? "border-ink bg-bg" : "border-border-color hover:border-muted"
                    )}
                  >
                    <input {...getInputProps()} />
                    {uploading ? (
                      <Loader2 className="animate-spin text-ink" size={48} />
                    ) : (
                      <>
                        <Upload size={48} className="text-muted mb-4" />
                        <p className="text-sm text-muted text-center">
                          {isDragActive ? "Drop the file here" : "Drag & drop your file here, or click to browse"}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {uploadType === "story" && (
                  <button
                    onClick={() => onDrop([])}
                    disabled={uploading}
                    className="w-full bg-ink text-bg py-4 rounded-2xl font-medium hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    {uploading ? <Loader2 className="animate-spin" size={20} /> : <span>Save Story</span>}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}










