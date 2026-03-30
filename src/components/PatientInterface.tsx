import React, { useState, useEffect, useRef } from "react";
import { auth } from "../firebase";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, Image as ImageIcon, Heart, ArrowRight, Loader2, Camera, Music, Copy, Check } from "lucide-react";
import { generateMemoryResponse, identifyPerson } from "../services/aiService";
import { cn } from "../lib/utils";

export default function PatientInterface({ patientName }: { patientName: string }) {
  const [memories, setMemories] = useState<any[]>([]);
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
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setMemories(data);
        memoriesRef.current = data;
        const firstPhoto = data.find((m: any) => m.type === "photo");
        if (firstPhoto) setCurrentPhoto(firstPhoto.file_url);
      }
    } catch (error) {
      console.error("Failed to fetch memories:", error);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

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

  useEffect(() => {
    // Proactive Mode: Every 60 seconds if idle
    const proactiveInterval = setInterval(() => {
      const idleTime = Date.now() - lastInteractionRef.current;
      if (idleTime > 60000 && memoriesRef.current.length > 0) {
        triggerProactiveMemory();
      }
    }, 10000);

    return () => clearInterval(proactiveInterval);
  }, []);

  const triggerProactiveMemory = async () => {
    const currentMemories = memoriesRef.current;
    const randomMemory = currentMemories[Math.floor(Math.random() * currentMemories.length)];
    if (!randomMemory) return;

    setIsThinking(true);
    setLastInputMethod("text"); // Show text for proactive memories
    const prompt = `${patientName} hasn't spoken in a while. Proactively share a warm memory about ${randomMemory.occasion || "a special day"}.`;
    try {
      const response = await generateMemoryResponse(patientName, prompt, currentMemories);
      setAiResponse(response || "");
      if (randomMemory.type === 'photo') setCurrentPhoto(randomMemory.file_url);
      speak(response || "");
    } catch (error) {
      console.error(error);
    } finally {
      setIsThinking(false);
      lastInteractionRef.current = Date.now();
    }
  };

  const handleVoiceInput = async (text: string) => {
    lastInteractionRef.current = Date.now();
    setIsThinking(true);
    const currentMemories = memoriesRef.current;
    try {
      const response = await generateMemoryResponse(patientName, text, currentMemories);
      setAiResponse(response || "");
      
      const relevantMemory = currentMemories.find(m => 
        m.type === 'photo' && 
        ((m.people && Array.isArray(m.people) && m.people.some((p: string) => text.toLowerCase().includes(p.toLowerCase()))) ||
         (m.occasion && m.occasion.toLowerCase().includes(text.toLowerCase())))
      );
      if (relevantMemory) setCurrentPhoto(relevantMemory.file_url);

      speak(response || "");
    } catch (error) {
      console.error(error);
    } finally {
      setIsThinking(false);
    }
  };

  const speak = async (text: string) => {
    if (!text) return;
    
    // Pause listening while speaking to avoid feedback
    const wasListening = isListeningRef.current;
    if (wasListening) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
    }

    try {
      // Stop any current speaking
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause();
        voiceAudioRef.current.src = "";
      }
      window.speechSynthesis.cancel();

      // Try ElevenLabs first
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (voiceAudioRef.current) {
          voiceAudioRef.current.src = url;
          
          voiceAudioRef.current.onended = () => {
            if (wasListening) {
              try {
                recognitionRef.current?.start();
              } catch (e) {}
            }
          };

          voiceAudioRef.current.play().catch(err => {
            console.error("Audio play failed:", err);
            fallbackSpeak(text, wasListening);
          });
        }
      } else {
        fallbackSpeak(text, wasListening);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      fallbackSpeak(text, wasListening);
    }
  };

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
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
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
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-4 sm:px-8 py-6 font-serif overflow-hidden">
      <div className="max-w-4xl w-full flex flex-col items-center gap-6 sm:gap-12">
        
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
      </div>

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

