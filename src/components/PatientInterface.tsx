import React, { useState, useEffect, useRef, useCallback } from "react";
import { auth } from "../firebase";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { Mic, MicOff, Volume2, Image as ImageIcon, Loader2, Camera, Music, Copy, Check, Clock, Play, X, Sparkles, BookOpen, MapPin, Aperture } from "lucide-react";
import { generateMemoryResponse, identifyPerson } from "../services/aiService";
import { cn } from "../lib/utils";

// ── Timeline card with scroll-triggered animation ──────────────────────────
function TimelineCard({ memory, voiceMap, onNarrate, index, isLeft }: {
  memory: any;
  voiceMap: Record<string, string>;
  onNarrate: (memory: any, voiceId?: string) => void;
  index: number;
  isLeft: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const person = memory.people?.[0] ?? "Unknown";
  const voiceId = voiceMap[person.toLowerCase()];

  return (
    <div ref={ref} className={cn("flex w-full items-start gap-4", isLeft ? "flex-row" : "flex-row-reverse")}>
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, x: isLeft ? -40 : 40 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.5, delay: index * 0.05, ease: "easeOut" }}
        className="flex-1 bg-surface/70 backdrop-blur-md border border-border-color rounded-2xl overflow-hidden shadow-lg"
      >
        {memory.type === "photo" && memory.file_url && (
          <img src={memory.file_url} alt={memory.occasion ?? "memory"} className="w-full h-40 object-cover" />
        )}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-sans text-xs uppercase tracking-widest text-muted flex items-center gap-1.5">
              {memory.type === "photo" ? <Aperture size={12} /> : memory.type === "voice" ? <Volume2 size={12} /> : <BookOpen size={12} />}
              {memory.occasion ?? memory.type}
            </span>
            {memory.year && <span className="font-mono text-xs text-muted">{memory.year}</span>}
          </div>
          {memory.transcript && (
            <p className="text-sm text-ink leading-relaxed line-clamp-3">{memory.transcript}</p>
          )}
          {memory.location && <p className="text-xs text-muted flex items-center gap-1"><MapPin size={11} />{memory.location}</p>}
          {memory.people?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {memory.people.map((p: string) => (
                <span key={p} className="text-xs bg-ink/10 text-ink px-2 py-0.5 rounded-full">{p}</span>
              ))}
            </div>
          )}
          <button
            onClick={() => onNarrate(memory, voiceId)}
            className="mt-1 flex items-center gap-1.5 text-xs font-sans uppercase tracking-widest text-ink bg-ink/10 hover:bg-ink/20 px-3 py-1.5 rounded-full transition-colors"
          >
            <Play size={12} /> Narrate{voiceId ? " in their voice" : ""}
          </button>
        </div>
      </motion.div>

      {/* Timeline dot */}
      <motion.div
        initial={{ scale: 0 }}
        animate={inView ? { scale: 1 } : {}}
        transition={{ duration: 0.3, delay: index * 0.05 + 0.2 }}
        className="mt-6 w-3 h-3 rounded-full bg-ink flex-shrink-0 ring-4 ring-bg"
      />
    </div>
  );
}

// ── Person group on the timeline ─────────────────────────────────────────────
function PersonTimeline({ person, memories, voiceMap, onNarrate, groupIndex }: {
  person: string;
  memories: any[];
  voiceMap: Record<string, string>;
  onNarrate: (memory: any, voiceId?: string) => void;
  groupIndex: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const sorted = [...memories].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  return (
    <div ref={ref} className="mb-12">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, delay: groupIndex * 0.1 }}
        className="flex items-center gap-3 mb-6"
      >
        <div className="w-10 h-10 rounded-full bg-ink/10 flex items-center justify-center text-lg font-serif font-bold text-ink">
          {person[0]?.toUpperCase()}
        </div>
        <h3 className="text-xl font-serif font-semibold text-ink">{person}</h3>
        {voiceMap[person.toLowerCase()] && (
          <span className="text-xs font-sans uppercase tracking-widest text-muted bg-surface px-2 py-0.5 rounded-full border border-border-color">voice cloned</span>
        )}
      </motion.div>

      {/* Vertical line + cards */}
      <div className="relative pl-4">
        <motion.div
          initial={{ scaleY: 0 }}
          animate={inView ? { scaleY: 1 } : {}}
          transition={{ duration: 0.6, delay: groupIndex * 0.1 + 0.2, ease: "easeInOut" }}
          style={{ originY: 0 }}
          className="absolute left-[calc(50%-1px)] top-0 bottom-0 w-0.5 bg-ink/20"
        />
        <div className="space-y-6">
          {sorted.map((m, i) => (
            <TimelineCard
              key={m.id}
              memory={m}
              voiceMap={voiceMap}
              onNarrate={onNarrate}
              index={i}
              isLeft={i % 2 === 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Flashback overlay ───────────────────────────────────────────────────────
function FlashbackOverlay({ memories, voiceMap, onDismiss }: {
  memories: any[];
  voiceMap: Record<string, string>;
  onDismiss: () => void;
}) {
  const sorted = [...memories].sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
  const [idx, setIdx] = useState(0);
  const [narrating, setNarrating] = useState(false);
  const [caption, setCaption] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = sorted[idx];

  const advance = useCallback(() => {
    setIdx(i => {
      if (i + 1 >= sorted.length) { onDismiss(); return i; }
      return i + 1;
    });
  }, [sorted.length, onDismiss]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    setNarrating(true);
    setCaption("");

    const person = current.people?.[0] ?? null;
    const voiceId = person ? voiceMap[person.toLowerCase()] : undefined;
    const text = current.transcript ||
      `A memory from ${current.year ?? "the past"}${
        current.occasion ? `, ${current.occasion}` : ""
      }${person ? `, with ${person}` : ""}${
        current.location ? `, in ${current.location}` : ""
      }.`;

    setCaption(text);

    (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId }),
        });
        if (cancelled) return;
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (audioRef.current && !cancelled) {
            audioRef.current.src = url;
            audioRef.current.onended = () => {
              if (cancelled) return;
              setNarrating(false);
              advanceTimer.current = setTimeout(advance, 2800);
            };
            audioRef.current.play().catch(() => {
              if (!cancelled) { setNarrating(false); advanceTimer.current = setTimeout(advance, 4000); }
            });
          }
        } else {
          const utt = new SpeechSynthesisUtterance(text);
          utt.rate = 0.88; utt.pitch = 1.05;
          utt.onend = () => { if (!cancelled) { setNarrating(false); advanceTimer.current = setTimeout(advance, 2800); } };
          window.speechSynthesis.speak(utt);
        }
      } catch {
        if (!cancelled) { setNarrating(false); advanceTimer.current = setTimeout(advance, 4000); }
      }
    })();

    return () => {
      cancelled = true;
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
      window.speechSynthesis.cancel();
    };
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onClick={onDismiss}
    >
      <audio ref={audioRef} />

      {/* Full-bleed photo with Ken Burns */}
      <div className="absolute inset-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {current?.file_url ? (
            <motion.img
              key={current.id}
              src={current.file_url}
              initial={{ scale: 1.08, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeInOut" }}
              className="w-full h-full object-cover"
            />
          ) : (
            <motion.div
              key={`bg-${idx}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="w-full h-full bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]"
            />
          )}
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/50 pointer-events-none" />
      </div>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-6">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-white/60 font-sans text-xs uppercase tracking-widest"
        >
          <Sparkles size={14} />
          <span>Flashback</span>
        </motion.div>
        <button
          onClick={e => { e.stopPropagation(); onDismiss(); }}
          className="text-white/50 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Centre: person + year + occasion */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={current?.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="space-y-3"
          >
            {current?.people?.[0] && (
              <p className="text-white/50 font-sans text-sm uppercase tracking-[0.2em]">{current.people[0]}</p>
            )}
            {current?.year && (
              <p className="text-white/25 font-mono text-6xl font-bold leading-none">{current.year}</p>
            )}
            {current?.occasion && (
              <p className="text-white/60 font-serif text-xl italic">{current.occasion}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Caption */}
      <div className="relative z-10 px-8 pb-4 min-h-[80px] flex items-end justify-center">
        <AnimatePresence mode="wait">
          {caption && (
            <motion.p
              key={caption}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="text-white/80 font-serif text-base sm:text-lg text-center leading-relaxed max-w-xl line-clamp-3"
            >
              {caption}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Waveform + progress dots */}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-8">
        {narrating && (
          <div className="flex gap-1 items-end h-5">
            {[0,1,2,3,4].map(i => (
              <motion.div
                key={i}
                animate={{ height: [6, 18, 6] }}
                transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                className="w-1 bg-white/60 rounded-full"
              />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {sorted.map((_, i) => (
            <motion.div
              key={i}
              animate={{ scale: i === idx ? 1.4 : 1, opacity: i === idx ? 1 : 0.3 }}
              transition={{ duration: 0.3 }}
              className="w-1.5 h-1.5 rounded-full bg-white"
            />
          ))}
        </div>
        <p className="text-white/30 font-sans text-xs uppercase tracking-widest mt-1">Tap anywhere to return</p>
      </div>
    </motion.div>
  );
}

export default function PatientInterface({ patientName }: { patientName: string }) {
  const [activeTab, setActiveTab] = useState<"companion" | "timeline">("companion");
  const [memories, setMemories] = useState<any[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>(`Hello ${patientName}. I'm here to remember with you.`);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [lastInputMethod, setLastInputMethod] = useState<"text" | "voice">("text");
  const [isVoiceSupported, setIsVoiceSupported] = useState(true);
  const [copied, setCopied] = useState(false);
  const [narratingId, setNarratingId] = useState<number | null>(null);
  const [flashbackActive, setFlashbackActive] = useState(false);

  const patientUid = auth.currentUser?.uid;

  const copyUid = () => {
    if (!patientUid) return;
    navigator.clipboard.writeText(patientUid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ambientAudioRef = useRef<HTMLAudioElement>(null);
  const voiceAudioRef = useRef<HTMLAudioElement>(null);
  const lastInteractionRef = useRef<number>(Date.now());

  const isListeningRef = useRef(false);
  const memoriesRef = useRef<any[]>([]);

  const fetchMemories = async () => {
    try {
      const uid = auth.currentUser?.uid;
      const url = uid ? `/api/memories?patientId=${uid}` : "/api/memories";
      const [memRes, voiceRes] = await Promise.all([fetch(url), fetch("/api/voices")]);
      if (memRes.ok) {
        const data = await memRes.json();
        setMemories(data);
        memoriesRef.current = data;
        const firstPhoto = data.find((m: any) => m.type === "photo");
        if (firstPhoto) setCurrentPhoto(firstPhoto.file_url);
      }
      if (voiceRes.ok) {
        setVoices(await voiceRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch memories:", error);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  // voiceMap: person name (lowercase) -> elevenlabs voice_id
  const voiceMap: Record<string, string> = {};
  for (const v of voices) {
    voiceMap[v.person_name.toLowerCase()] = v.voice_id;
  }

  // Group memories by first person tagged
  const personGroups: Record<string, any[]> = {};
  for (const m of memories) {
    const person = m.people?.[0] ?? "Untagged";
    if (!personGroups[person]) personGroups[person] = [];
    personGroups[person].push(m);
  }

  const narrateMemory = async (memory: any, voiceId?: string) => {
    setNarratingId(memory.id);
    setActiveTab("companion");
    if (memory.type === "photo" && memory.file_url) setCurrentPhoto(memory.file_url);
    const text = memory.transcript ||
      `This is a ${memory.type} memory from ${memory.year ?? "the past"}${
        memory.occasion ? ` — ${memory.occasion}` : ""
      }${
        memory.people?.length ? ` with ${memory.people.join(", ")}` : ""
      }${
        memory.location ? ` in ${memory.location}` : ""
      }.`;
    setAiResponse(text);
    setLastInputMethod("text");
    await speakWithVoice(text, voiceId);
    setNarratingId(null);
  };

  const speakWithVoice = async (text: string, voiceId?: string) => {
    if (!text) return;
    const wasListening = isListeningRef.current;
    if (wasListening) { try { recognitionRef.current?.stop(); } catch (e) {} }
    try {
      if (voiceAudioRef.current) { voiceAudioRef.current.pause(); voiceAudioRef.current.src = ""; }
      window.speechSynthesis.cancel();
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (voiceAudioRef.current) {
          voiceAudioRef.current.src = url;
          voiceAudioRef.current.onended = () => { if (wasListening) { try { recognitionRef.current?.start(); } catch (e) {} } };
          voiceAudioRef.current.play().catch(() => fallbackSpeak(text, wasListening));
        }
      } else { fallbackSpeak(text, wasListening); }
    } catch { fallbackSpeak(text, wasListening); }
  };

  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const finalTranscript = event.results[i][0].transcript;
            setTranscript(finalTranscript);
            setLastInputMethod("voice");
            handleVoiceInput(finalTranscript).catch(err => console.error("Voice input handling failed:", err));
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (interimTranscript) {
           setTranscript(interimTranscript);
        }
      };

      recognitionRef.current.onend = () => {
        // Auto-restart if we're still supposed to be listening
        if (isListeningRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // Ignore errors if it's already started
          }
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // 'no-speech' is common in continuous mode, just ignore it
          // onend will handle the restart if isListeningRef.current is true
          return;
        }
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          setIsListening(false);
          isListeningRef.current = false;
          setIsVoiceSupported(false);
        }
      };
    } else {
      setIsVoiceSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
    };
  }, []);

  const dismissFlashback = useCallback(() => {
    setFlashbackActive(false);
    lastInteractionRef.current = Date.now();
  }, []);

  useEffect(() => {
    const idleInterval = setInterval(() => {
      const idleTime = Date.now() - lastInteractionRef.current;
      if (idleTime > 60000 && memoriesRef.current.length > 0 && !flashbackActive) {
        setFlashbackActive(true);
      }
    }, 10000);
    return () => clearInterval(idleInterval);
  }, [flashbackActive]);

  const handleVoiceInput = async (text: string) => {
    lastInteractionRef.current = Date.now();
    setIsThinking(true);
    const currentMemories = memoriesRef.current;
    try {
      const { text: responseText, speakerName } = await generateMemoryResponse(patientName, text, currentMemories);
      setAiResponse(responseText);

      const relevantMemory = currentMemories.find((m: any) =>
        m.type === 'photo' &&
        ((m.people && Array.isArray(m.people) && m.people.some((p: string) => text.toLowerCase().includes(p.toLowerCase()))) ||
         (m.occasion && m.occasion.toLowerCase().includes(text.toLowerCase())))
      );
      if (relevantMemory) setCurrentPhoto(relevantMemory.file_url);

      const vid = speakerName ? voiceMap[speakerName.toLowerCase()] : undefined;
      speakWithVoice(responseText, vid);
    } catch (error) {
      console.error(error);
    } finally {
      setIsThinking(false);
    }
  };

  const speak = (text: string) => speakWithVoice(text);

  const fallbackSpeak = (text: string, wasListening: boolean) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    utterance.onend = () => {
      if (wasListening) {
        try {
          recognitionRef.current?.start();
        } catch (e) {}
      }
    };
    window.speechSynthesis.speak(utterance);
  };

  const toggleListening = () => {
    lastInteractionRef.current = Date.now();
    if (isListening) {
      isListeningRef.current = false;
      setIsListening(false);
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.error("Error stopping recognition:", e);
      }
    } else {
      setTranscript("");
      isListeningRef.current = true;
      setIsListening(true);
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error("Error starting recognition:", e);
        // If it's already started, just set state
        if (e instanceof Error && e.message.includes("already started")) {
          // No action needed
        }
      }
    }
  };

  const cameraStreamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      cameraStreamRef.current = stream;
      setShowCamera(true);
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  useEffect(() => {
    if (showCamera && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [showCamera]);

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    cameraStreamRef.current = null;
    setShowCamera(false);
  };

  const identifyFace = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsIdentifying(true);
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    // Ensure video has dimensions before drawing
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setIsIdentifying(false);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    
    const imageData = canvas.toDataURL("image/jpeg");
    try {
      const response = await identifyPerson(imageData, memories);
      setAiResponse(response);
      speak(response);
    } catch (error) {
      console.error(error);
    } finally {
      setIsIdentifying(false);
    }
  };

  useEffect(() => {
    if (isMusicPlaying) ambientAudioRef.current?.play().catch(console.error);
    else ambientAudioRef.current?.pause();
  }, [isMusicPlaying]);

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center px-4 sm:px-8 py-6 font-serif overflow-hidden">
      {/* Tab bar */}
      <div className="flex gap-2 mb-8 bg-surface/60 backdrop-blur-md border border-border-color rounded-full p-1 shadow-sm">
        {(["companion", "timeline"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-6 py-2 rounded-full font-sans text-sm uppercase tracking-widest transition-all",
              activeTab === tab ? "bg-ink text-bg shadow" : "text-muted hover:text-ink"
            )}
          >
            <span className="flex items-center gap-2">
              {tab === "companion" ? <Sparkles size={14} /> : <Clock size={14} />}
              {tab === "companion" ? "Companion" : "Timeline"}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "timeline" ? (
          <motion.div
            key="timeline"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-2xl pb-24"
          >
            {Object.keys(personGroups).length === 0 ? (
              <div className="flex flex-col items-center gap-4 mt-20 text-muted">
                <Clock size={48} className="opacity-30" />
                <p className="font-sans text-sm uppercase tracking-widest">No memories yet</p>
                <p className="text-sm text-center">Ask a family member to upload memories for you.</p>
              </div>
            ) : (
              Object.entries(personGroups).map(([person, mems], gi) => (
                <PersonTimeline
                  key={person}
                  person={person}
                  memories={mems}
                  voiceMap={voiceMap}
                  onNarrate={narrateMemory}
                  groupIndex={gi}
                />
              ))
            )}
          </motion.div>
        ) : (
          <motion.div
            key="companion"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }}
            className="max-w-4xl w-full flex flex-col items-center gap-6 sm:gap-12"
          >
        
        {/* Memory Visual / Camera */}
        <motion.div 
          layoutId="memory-visual"
          className="relative w-full aspect-video sm:aspect-[16/10] bg-surface rounded-[32px] sm:rounded-[60px] shadow-2xl overflow-hidden border-[6px] sm:border-[12px] border-surface"
        >
          <AnimatePresence mode="wait">
            {showCamera ? (
              <div className="relative w-full h-full">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                <div className="absolute inset-0 flex items-center justify-center">
                   {isIdentifying && <Loader2 className="animate-spin text-white" size={64} />}
                </div>
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4">
                   <button 
                     onClick={identifyFace}
                     disabled={isIdentifying}
                     className="bg-ink text-bg px-8 py-4 rounded-full font-sans text-lg font-medium shadow-xl hover:scale-105 transition-all"
                   >
                      Who is this?
                   </button>
                   <button 
                     onClick={stopCamera}
                     className="bg-surface text-ink px-8 py-4 rounded-full font-sans text-lg font-medium shadow-xl hover:scale-105 transition-all"
                   >
                      Close Camera
                   </button>
                </div>
              </div>
            ) : currentPhoto ? (
              <motion.img
                key={currentPhoto}
                src={currentPhoto}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-bg">
                <ImageIcon size={80} className="text-muted" />
              </div>
            )}
          </AnimatePresence>
          {!showCamera && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
              <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
                 <div className="bg-surface/20 backdrop-blur-md px-6 py-3 rounded-full border border-white/30 text-white text-lg">
                    Beautiful Memories
                 </div>
                 <button 
                   onClick={startCamera}
                   className="bg-surface/20 backdrop-blur-md p-4 rounded-full border border-white/30 text-white hover:bg-surface/40 transition-all"
                 >
                    <Camera size={24} />
                 </button>
              </div>
            </>
          )}
        </motion.div>

        {/* AI Response Area */}
        <div className="text-center space-y-8 max-w-2xl w-full min-h-[80px] sm:min-h-[120px] flex items-center justify-center px-2">
          <AnimatePresence mode="wait">
            {isThinking ? (
              <motion.div
                key="thinking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-muted font-sans text-sm uppercase tracking-widest"
              >
                <Loader2 size={24} className="animate-spin" />
                <span>Recalling...</span>
              </motion.div>
            ) : lastInputMethod === "text" ? (
              <motion.p
                key={aiResponse}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-2xl sm:text-4xl md:text-5xl font-medium text-ink leading-tight tracking-tight"
              >
                {aiResponse}
              </motion.p>
            ) : (
              <motion.div
                key="speaking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      animate={{
                        height: [20, 40, 20],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.6,
                        delay: i * 0.2,
                      }}
                      className="w-2 bg-ink rounded-full"
                    />
                  ))}
                </div>
                <p className="text-xl text-muted uppercase tracking-widest font-sans">Speaking...</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="h-8">
          {transcript && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xl text-muted italic text-center"
            >
              You said: "{transcript}"
            </motion.p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-6">
          {!isVoiceSupported && (
            <p className="text-red-500 text-sm font-sans uppercase tracking-widest">Voice input not supported in this browser</p>
          )}
          <div className="flex items-center gap-5 sm:gap-8">
            <button
              onClick={toggleListening}
              disabled={!isVoiceSupported}
              className={cn(
                "w-24 h-24 sm:w-32 sm:h-32 rounded-full flex items-center justify-center transition-all shadow-2xl relative group",
                isListening ? "bg-[#FF4B4B] scale-110" : "bg-ink hover:scale-105",
                !isVoiceSupported && "opacity-50 cursor-not-allowed"
              )}
            >
              {isListening ? (
                <MicOff size={36} className="text-white" />
              ) : (
                <Mic size={36} className="text-bg" />
              )}
              {isListening && (
                <motion.div
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 bg-[#FF4B4B] rounded-full"
                />
              )}
            </button>

            <div className="flex flex-col gap-4">
               <button 
                 onClick={() => {
                   setLastInputMethod("text");
                   speak(aiResponse);
                 }}
                 className="bg-surface p-4 rounded-full shadow-lg hover:bg-bg transition-colors text-ink"
               >
                  <Volume2 size={24} />
               </button>
               <button 
                 onClick={() => setIsMusicPlaying(!isMusicPlaying)}
                 className={cn(
                   "bg-surface p-4 rounded-full shadow-lg hover:bg-bg transition-colors",
                   isMusicPlaying ? "text-ink" : "text-muted"
                 )}
               >
                  <Music size={24} />
               </button>
            </div>
          </div>
        </div>

        {isThinking && (
          <div className="flex items-center gap-2 text-muted font-sans text-sm uppercase tracking-widest">
            <Loader2 size={16} className="animate-spin" />
            <span>Recalling...</span>
          </div>
        )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flashback mode */}
      <AnimatePresence>
        {flashbackActive && memories.length > 0 && (
          <FlashbackOverlay
            memories={memories}
            voiceMap={voiceMap}
            onDismiss={dismissFlashback}
          />
        )}
      </AnimatePresence>

      <audio ref={ambientAudioRef} loop src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" />
      <audio ref={voiceAudioRef} />

      {/* Patient UID — share with family to link accounts */}
      {patientUid && (
        <button
          onClick={copyUid}
          className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 flex items-center gap-2 bg-surface/80 backdrop-blur-md border border-border-color px-3 sm:px-4 py-2 rounded-full text-xs text-muted hover:text-ink transition-colors shadow-sm"
          title="Share this ID with your family member to link accounts"
        >
          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
          <span className="font-mono">{patientUid.slice(0, 8)}…</span>
          <span>{copied ? "Copied!" : "Copy my ID"}</span>
        </button>
      )}

      {/* Ambient Background Elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10 opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#E8D5C4] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#D5E8C4] rounded-full blur-[120px]" />
      </div>
    </div>
  );
}

