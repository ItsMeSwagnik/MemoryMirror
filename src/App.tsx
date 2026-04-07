import React, { useState, useEffect, useCallback } from "react";
import { auth } from "./firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import FamilyDashboard from "./components/FamilyDashboard";
import PatientInterface from "./components/PatientInterface";
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from "framer-motion";
import { User, Heart, ArrowRight, LogOut, Mail, Lock, Eye, EyeOff, Loader2, Sun, Moon, Shield, Info, Brain, Users, Sparkles, ChevronDown, X } from "lucide-react";
import { cn, api } from "./lib/utils";

export default function App() {
  const [view, setView] = useState<"landing" | "family" | "patient" | "profile" | "legal">("landing");
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [pendingView, setPendingView] = useState<"family" | "patient" | null>(null);
  const [selectedRole, setSelectedRole] = useState<"family" | "patient">("family");
  const [userRole, setUserRole] = useState<"family" | "patient" | null>(null);
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    return (localStorage.getItem("theme") as any) || "system";
  });
  const [selectedInfoCard, setSelectedInfoCard] = useState<string | null>(null);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number; scale: number; rotate: number }[]>([]);
  const { scrollYProgress } = useScroll();
  const backgroundY = useTransform(scrollYProgress, [0, 0.5], [0, -150]);
  const mouseX = useSpring(0, { stiffness: 50, damping: 20 });
  const mouseY = useSpring(0, { stiffness: 50, damping: 20 });

  const parallaxX = useTransform(mouseX, (v) => `calc(-50% + ${v}px)`);
  const parallaxY = useTransform([mouseY, backgroundY], ([mY, bY]) => `calc(-50% + ${mY as number}px + ${bY as number}px)`);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth - 0.5) * 50);
      mouseY.set((e.clientY / window.innerHeight - 0.5) * 50);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const handleHeartDoubleClick = useCallback(() => {
    const newHearts = Array.from({ length: 8 }).map((_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 150,
      y: (Math.random() - 0.5) * 150 - 50,
      scale: Math.random() * 0.4 + 0.6,
      rotate: (Math.random() - 0.5) * 45,
    }));
    setHearts(prev => [...prev, ...newHearts]);
    setTimeout(() => {
      setHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
    }, 1000);
  }, []);

  useEffect(() => {
    // Auto-trigger on load
    const timer = setTimeout(() => {
      handleHeartDoubleClick();
    }, 800); // Sync with heartbeat timing
    return () => clearTimeout(timer);
  }, [handleHeartDoubleClick]);

  const infoCards = {
    dementia: {
      title: "What is Dementia?",
      icon: <Brain size={32} />,
      content: "Dementia is not a single disease; it's an umbrella term for a range of medical conditions, including Alzheimer's disease. Disorders grouped under the general term 'dementia' are caused by abnormal brain changes. These changes trigger a decline in thinking skills, also known as cognitive abilities, severe enough to impair daily life and independent function. They also affect behavior, feelings and relationships.",
      bullets: [
        "Memory loss that disrupts daily life",
        "Challenges in planning or solving problems",
        "Difficulty completing familiar tasks",
        "Confusion with time or place",
        "Trouble understanding visual images and spatial relationships"
      ]
    },
    helps: {
      title: "How MemoryMirror Helps",
      icon: <Users size={32} />,
      content: "We utilize Reminiscence Therapy (RT), which involves the discussion of past activities, events and experiences with another person or group of people, usually with the aid of tangible prompts such as photographs, household and other familiar items from the past, music and archive sound recordings.",
      bullets: [
        "Stimulates mental activity and improves mood",
        "Reduces feelings of isolation and depression",
        "Provides a patient, non-judgmental 24/7 companion",
        "Preserves family legacy through digital storytelling",
        "Reduces caregiver stress by providing meaningful engagement"
      ]
    },
    family: {
      title: "Strengthening Family Bonds",
      icon: <Shield size={32} />,
      content: "MemoryMirror acts as a bridge. While families can't always be present, their voices and memories can be. By contributing to the memory bank, family members play an active role in their loved one's therapy and daily comfort.",
      bullets: [
        "Easy upload of photos, voice clips, and stories",
        "Real-time visibility into what memories are being revisited",
        "Collaborative memory building across generations",
        "Secure and private data handling for your family",
        "Peace of mind knowing your loved one is engaged"
      ]
    }
  };

  const fetchUserRole = async (uid: string): Promise<"family" | "patient" | null> => {
    try {
      const res = await fetch(api(`/api/user-role/${uid}`));
      if (res.ok) {
        const data = await res.json();
        if (data.role === "family" || data.role === "patient") {
          localStorage.setItem(`role_${uid}`, data.role);
          return data.role;
        }
      }
    } catch { /* fall through to localStorage */ }
    // Fallback: localStorage (offline / backend unavailable)
    const cached = localStorage.getItem(`role_${uid}`);
    return cached === "family" || cached === "patient" ? cached : null;
  };

  const saveUserRole = async (uid: string, role: "family" | "patient") => {
    localStorage.setItem(`role_${uid}`, role);
    try {
      await fetch(api("/api/user-role"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, role }),
      });
    } catch {
      // Backend unavailable — role is saved in localStorage, app still works
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u ?? null);
      if (u) {
        const role = await fetchUserRole(u.uid);
        setUserRole(role);
      } else {
        setUserRole(null);
      }
    }, () => {
      setUser(null);
      setUserRole(null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.toggle("dark", systemTheme === "dark");
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const uid = result.user.uid;
      const existingRole = await fetchUserRole(uid);
      const resolvedRole = existingRole || selectedRole;
      if (!existingRole) await saveUserRole(uid, selectedRole);
      setUserRole(resolvedRole);
      setView(resolvedRole);
      setShowEmailAuth(false);
    } catch (error) {
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError("");
    try {
      if (authMode === "signup") {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName });
        await saveUserRole(result.user.uid, selectedRole);
        setUserRole(selectedRole);
        setShowEmailAuth(false);
        setView(selectedRole);
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const role = await fetchUserRole(result.user.uid);
        const resolvedRole = role || selectedRole;
        if (!role) await saveUserRole(result.user.uid, selectedRole);
        setUserRole(resolvedRole);
        setShowEmailAuth(false);
        setView(resolvedRole);
      }
    } catch (error: any) {
      const code = error?.code ?? "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential")
        setAuthError("Incorrect email or password.");
      else if (code === "auth/email-already-in-use")
        setAuthError("An account with this email already exists.");
      else if (code === "auth/weak-password")
        setAuthError("Password must be at least 6 characters.");
      else if (code === "auth/unauthorized-domain")
        setAuthError("This domain is not authorised in Firebase. Add it under Authentication → Authorized domains.");
      else
        setAuthError(error?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const startLogin = async (targetView: "family" | "patient") => {
    if (user) {
      const role = await fetchUserRole(user.uid);
      setView(role || targetView);
    } else {
      setPendingView(targetView);
      setSelectedRole(targetView);
      setShowEmailAuth(true);
    }
  };

  const handleLogout = () => {
    auth.signOut();
    setView("landing");
  };

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "system";
      return "light";
    });
  };

  return (
    <div className="min-h-screen text-ink selection:bg-ink selection:text-bg">
      {/* Persistent glow orbs - fixed, outside everything */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute top-[10%] left-[5%] w-[50%] h-[50%] rounded-full blur-[120px] animate-glow-1" style={{ backgroundColor: 'var(--orb1)' }} />
        <div className="absolute bottom-[10%] right-[5%] w-[50%] h-[50%] rounded-full blur-[120px] animate-glow-2" style={{ backgroundColor: 'var(--orb2)' }} />
      </div>
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-bg/80 backdrop-blur-md border-b border-border-color">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <button onClick={() => setView("landing")} className="text-lg sm:text-xl font-serif font-medium tracking-tight flex items-center gap-2">
            <Heart size={18} className="text-ink" />
            <span>MemoryMirror</span>
          </button>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="p-2 hover:bg-surface rounded-full transition-colors"
              title={`Theme: ${theme}`}
            >
              {theme === "light" && <Sun size={20} />}
              {theme === "dark" && <Moon size={20} />}
              {theme === "system" && <Sparkles size={20} />}
            </button>
            
            {user ? (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setView("profile")}
                  className="w-8 h-8 rounded-full bg-surface border border-border-color flex items-center justify-center overflow-hidden"
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User size={16} />
                  )}
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowEmailAuth(true)}
                className="text-sm font-medium px-4 py-2 rounded-full border border-border-color hover:bg-surface transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <AnimatePresence mode="wait">
        {view === "landing" && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pt-16 relative" style={{ zIndex: 1 }}
          >
            {/* Hero Section */}
            <section className="min-h-[95vh] flex flex-col items-center justify-center px-4 sm:px-8 pt-24 sm:pt-32 pb-16 sm:pb-32 text-center relative overflow-hidden select-none">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="max-w-3xl relative z-10"
              >
                <motion.div 
                  onDoubleClick={handleHeartDoubleClick}
                  whileHover={{ scale: 1.1, rotate: 15 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-20 h-20 bg-ink rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl rotate-12 cursor-pointer relative group"
                >
                  <motion.div
                    animate={{ scale: [1, 1.15, 1, 1.15, 1] }}
                    transition={{ 
                      duration: 1.5, 
                      repeat: 1, 
                      ease: "easeInOut",
                      times: [0, 0.2, 0.4, 0.6, 1]
                    }}
                  >
                    <Heart className="text-bg" size={40} />
                  </motion.div>
                  <AnimatePresence>
                    {hearts.map((h) => (
                      <motion.div
                        key={h.id}
                        initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
                        animate={{ opacity: 0, scale: h.scale, x: h.x, y: h.y, rotate: h.rotate }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute pointer-events-none"
                      >
                        <Heart className="text-ink fill-ink" size={24} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
                <h1 className="text-4xl sm:text-5xl md:text-7xl font-serif font-medium mb-4 sm:mb-6 tracking-tight">MemoryMirror</h1>
                <p className="text-base sm:text-lg md:text-xl text-muted mb-8 sm:mb-12 leading-relaxed">
                  A gentle bridge between families and their loved ones. AI-powered memories that speak, listen, and remember.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center w-full">
                  <button
                    onClick={() => startLogin("family")}
                    className="group bg-ink text-bg px-7 sm:px-10 py-4 sm:py-5 rounded-[24px] text-base sm:text-lg font-medium flex items-center justify-center gap-3 hover:bg-opacity-90 transition-all shadow-xl hover:scale-105"
                  >
                    <User size={22} />
                    <span>Family Dashboard</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                  
                  <button
                    onClick={() => startLogin("patient")}
                    className="group bg-surface text-ink border-2 border-ink px-7 sm:px-10 py-4 sm:py-5 rounded-[24px] text-base sm:text-lg font-medium flex items-center justify-center gap-3 hover:bg-bg transition-all shadow-xl hover:scale-105"
                  >
                    <Heart size={22} />
                    <span>Patient Companion</span>
                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted"
              >
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-60">Scroll to explore</span>
                <ChevronDown className="animate-bounce" size={18} />
              </motion.div>

            </section>

            {/* About Section */}
            <section className="py-16 sm:py-24 px-4 sm:px-6 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                <motion.div 
                  whileInView={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: 20 }}
                  viewport={{ once: true }}
                  whileHover={{ y: -10, scale: 1.02, rotateX: 2, rotateY: 2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedInfoCard('dementia')}
                  className="p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] bg-white/75 dark:bg-white/10 backdrop-blur-md glass-border shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:shadow-none cursor-pointer group transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.45)] dark:hover:shadow-none flex flex-col"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-ink/5 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 group-hover:bg-ink group-hover:text-bg transition-colors">
                    <Brain size={22} />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-serif font-medium mb-3 sm:mb-4 text-ink">What is Dementia?</h3>
                  <p className="text-muted leading-relaxed">
                    Dementia is a general term for loss of memory, language, and other thinking abilities that are severe enough to interfere with daily life. Alzheimer's is the most common cause.
                  </p>
                  <div className="mt-auto pt-6 flex items-center gap-2 text-ink font-medium text-sm opacity-100 transition-all duration-300">
                    <span className="underline underline-offset-4 decoration-ink/30 group-hover:decoration-ink transition-colors">Learn more</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.div>

                <motion.div 
                  whileInView={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: 20 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 }}
                  whileHover={{ y: -10, scale: 1.02, rotateX: 2, rotateY: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedInfoCard('helps')}
                  className="p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] bg-white/75 dark:bg-white/10 backdrop-blur-md glass-border shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:shadow-none cursor-pointer group transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.45)] dark:hover:shadow-none flex flex-col"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-ink/5 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 group-hover:bg-ink group-hover:text-bg transition-colors">
                    <Users size={22} />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-serif font-medium mb-3 sm:mb-4 text-ink">How it Helps</h3>
                  <p className="text-muted leading-relaxed">
                    MemoryMirror uses Reminiscence Therapy—a technique using photos and audio to stimulate memory. Our AI companion provides a patient, 24/7 presence to talk through these memories.
                  </p>
                  <div className="mt-auto pt-6 flex items-center gap-2 text-ink font-medium text-sm opacity-100 transition-all duration-300">
                    <span className="underline underline-offset-4 decoration-ink/30 group-hover:decoration-ink transition-colors">Learn more</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.div>

                <motion.div 
                  whileInView={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: 20 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                  whileHover={{ y: -10, scale: 1.02, rotateX: -2, rotateY: 2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedInfoCard('family')}
                  className="p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] bg-white/75 dark:bg-white/10 backdrop-blur-md glass-border shadow-[0_4px_24px_rgba(0,0,0,0.35)] dark:shadow-none cursor-pointer group transition-all hover:shadow-[0_20px_50px_rgba(0,0,0,0.45)] dark:hover:shadow-none flex flex-col"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-ink/5 rounded-2xl flex items-center justify-center mb-4 sm:mb-6 group-hover:bg-ink group-hover:text-bg transition-colors">
                    <Shield size={22} />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-serif font-medium mb-3 sm:mb-4 text-ink">Family Connection</h3>
                  <p className="text-muted leading-relaxed">
                    Families can upload photos, voice clips, and stories. MemoryMirror weaves these into a cohesive narrative, ensuring your loved one always feels connected to their history.
                  </p>
                  <div className="mt-auto pt-6 flex items-center gap-2 text-ink font-medium text-sm opacity-100 transition-all duration-300">
                    <span className="underline underline-offset-4 decoration-ink/30 group-hover:decoration-ink transition-colors">Learn more</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.div>
              </div>
            </section>

            {/* Info Modal */}
            <AnimatePresence>
              {selectedInfoCard && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSelectedInfoCard(null)}
                    className="absolute inset-0 bg-ink/40 backdrop-blur-md"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="bg-white/75 dark:bg-white/10 backdrop-blur-md w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-[40px] sm:rounded-[40px] shadow-2xl dark:shadow-none relative z-10 glass-border custom-scrollbar"
                  >
                    <div className="p-5 sm:p-12">
                      <div className="flex justify-between items-start mb-6 sm:mb-8">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 pr-2">
                          <div className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 bg-ink text-bg rounded-2xl flex items-center justify-center shadow-lg">
                            {infoCards[selectedInfoCard as keyof typeof infoCards].icon}
                          </div>
                          <h2 className="text-xl sm:text-3xl md:text-4xl font-serif font-medium text-ink leading-tight">
                            {infoCards[selectedInfoCard as keyof typeof infoCards].title}
                          </h2>
                        </div>
                        <button 
                          onClick={() => setSelectedInfoCard(null)}
                          className="p-2 hover:bg-bg rounded-full transition-colors text-ink"
                        >
                          <X size={24} />
                        </button>
                      </div>

                      <div className="space-y-6">
                        <p className="text-lg text-muted leading-relaxed">
                          {infoCards[selectedInfoCard as keyof typeof infoCards].content}
                        </p>
                        
                        <div className="grid grid-cols-1 gap-4">
                          {infoCards[selectedInfoCard as keyof typeof infoCards].bullets.map((bullet, idx) => (
                            <motion.div 
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.1 + (idx * 0.05) }}
                              key={idx} 
                              className="flex items-start gap-4 bg-bg/50 p-4 rounded-2xl border border-border-color"
                            >
                              <div className="mt-2.5 w-1.5 h-1.5 rounded-full bg-ink shrink-0" />
                              <span className="text-ink/80 leading-relaxed">{bullet}</span>
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-12">
                        <button
                          onClick={() => setSelectedInfoCard(null)}
                          className="w-full bg-ink text-bg py-4 rounded-2xl font-medium hover:bg-opacity-90 transition-all shadow-lg"
                        >
                          Got it, thanks
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Privacy & Legal Footer */}
            <footer className="py-10 sm:py-20 px-4 sm:px-6 border-t border-border-color">
              <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="text-muted text-sm">
                  © 2026 MemoryMirror. All rights reserved.
                </div>
                <div className="flex gap-8 text-sm font-medium">
                  <button onClick={() => setView("legal")} className="hover:text-muted transition-colors">Legal & Privacy</button>
                </div>
              </div>
            </footer>
          </motion.div>
        )}

        {view === "family" && (
          <motion.div key="family" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="pt-16">
            <FamilyDashboard />
            <button 
              onClick={() => setView("landing")}
              className="fixed bottom-4 sm:bottom-8 left-4 sm:left-8 bg-surface/80 backdrop-blur-md p-3 sm:p-4 rounded-full shadow-lg border border-border-color hover:bg-surface transition-all"
            >
              <ArrowRight className="rotate-180" size={20} />
            </button>
          </motion.div>
        )}

        {view === "patient" && (
          <motion.div key="patient" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="pt-16">
            <PatientInterface patientName={user?.displayName || user?.email?.split("@")[0] || "Friend"} />
            <button 
              onClick={() => setView("landing")}
              className="fixed bottom-4 sm:bottom-8 left-4 sm:left-8 bg-surface/80 backdrop-blur-md p-3 sm:p-4 rounded-full shadow-lg border border-border-color hover:bg-surface transition-all"
            >
              <ArrowRight className="rotate-180" size={20} />
            </button>
          </motion.div>
        )}

        {view === "profile" && (
          <motion.div key="profile" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="pt-20 sm:pt-32 px-4 sm:px-6 pb-12">
            <div className="max-w-xl mx-auto bg-white/75 dark:bg-white/10 backdrop-blur-md rounded-[32px] sm:rounded-[40px] p-6 sm:p-12 glass-border shadow-2xl dark:shadow-none">
              <div className="flex flex-col items-center text-center mb-12">
                <div className="w-32 h-32 rounded-full bg-bg border-4 border-surface shadow-xl mb-6 overflow-hidden flex items-center justify-center">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User size={64} className="text-muted" />
                  )}
                </div>
                <h2 className="text-3xl font-serif font-medium mb-2">{user?.displayName || "Family Member"}</h2>
                <p className="text-muted">{user?.email}</p>
                <div className="mt-4 px-4 py-1.5 rounded-full bg-ink/5 text-xs font-bold uppercase tracking-widest">
                  {userRole === "patient" ? "Patient Account" : "Family Account"}
                </div>
              </div>

              <div className="space-y-4">
                <button 
                  onClick={async () => { const role = await fetchUserRole(user?.uid); setView(role || "family"); }}
                  className="w-full p-4 rounded-2xl bg-bg border border-border-color flex items-center justify-between hover:bg-surface transition-colors"
                >
                  <span className="font-medium">Go to Dashboard</span>
                  <ArrowRight size={20} />
                </button>
                <button 
                  onClick={handleLogout}
                  className="w-full p-4 rounded-2xl bg-red-500/5 text-red-500 border border-red-500/20 flex items-center justify-between hover:bg-red-500/10 transition-colors"
                >
                  <span className="font-medium">Sign Out</span>
                  <LogOut size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {view === "legal" && (
          <motion.div key="legal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="pt-20 sm:pt-32 px-4 sm:px-6 pb-12 sm:pb-20">
            <div className="max-w-3xl mx-auto bg-white/75 dark:bg-white/10 backdrop-blur-md rounded-[32px] sm:rounded-[40px] p-6 sm:p-12 glass-border shadow-xl dark:shadow-none markdown-body">
              <h1>Legal & Privacy Center</h1>
              <p className="text-muted italic mb-12 border-b border-border-color pb-6">Last updated: March 28, 2026</p>
              
              <section className="mb-12">
                <h2 className="text-2xl font-serif mb-4">Privacy Policy</h2>
                <p>We collect memories (photos, audio, text) uploaded by family members to provide Reminiscence Therapy for patients. This data is stored securely in our cloud infrastructure.</p>
                <p>MemoryMirror uses advanced AI models to process memories and generate empathetic responses. Your data is used strictly for generating these responses and is not used to train global AI models without explicit consent.</p>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl font-serif mb-4">Terms of Service</h2>
                <p>By using MemoryMirror, you agree to use the platform for its intended purpose of supporting memory care. You are responsible for the content you upload and ensuring it respects the privacy of your loved ones.</p>
                <p>We reserve the right to suspend accounts that violate our community guidelines or misuse the AI companion features.</p>
              </section>

              <section className="mb-12">
                <h2 className="text-2xl font-serif mb-4">Legal Consent</h2>
                <p>By using this service, you represent that you have the legal right to provide data on behalf of the patient or have obtained their informed consent where possible.</p>
                <p>We implement industry-standard encryption and security protocols to protect your family's sensitive data. However, you acknowledge that no digital storage is 100% secure.</p>
              </section>
              
              <button 
                onClick={() => setView("landing")}
                className="mt-8 bg-ink text-bg px-8 py-3 rounded-full font-medium hover:opacity-90 transition-all shadow-lg"
              >
                Back to Home
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Email Auth Modal */}
      <AnimatePresence>
        {showEmailAuth && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmailAuth(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white/75 dark:bg-white/10 backdrop-blur-md w-full sm:max-w-md rounded-t-[40px] sm:rounded-[40px] shadow-2xl dark:shadow-none relative z-10 overflow-y-auto max-h-[95vh] p-6 sm:p-8 glass-border"
            >
              <div className="text-center mb-8">
                <h2 className="text-3xl font-serif font-medium mb-2">
                  {authMode === "login" ? "Welcome Back" : "Create Account"}
                </h2>
                <p className="text-muted">
                  {authMode === "login" 
                    ? "Sign in to access your memories" 
                    : "Start preserving your family legacy"}
                </p>
              </div>

              {authMode === "signup" && (
                <div className="flex rounded-2xl bg-bg p-1 mb-4">
                  <button
                    type="button"
                    onClick={() => setSelectedRole("family")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                      selectedRole === "family" ? "bg-ink text-bg shadow" : "text-muted hover:text-ink"
                    }`}
                  >
                    <User size={16} />
                    Family Member
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole("patient")}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                      selectedRole === "patient" ? "bg-ink text-bg shadow" : "text-muted hover:text-ink"
                    }`}
                  >
                    <Heart size={16} />
                    Patient
                  </button>
                </div>
              )}

              <form onSubmit={handleEmailAuth} className="space-y-4">
                {authMode === "signup" && (
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      className="w-full bg-bg border-none rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-2 focus:ring-ink outline-none"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
                  <input
                    type="email"
                    required
                    placeholder="Email Address"
                    className="w-full bg-bg border-none rounded-2xl pl-12 pr-4 py-4 text-sm focus:ring-2 focus:ring-ink outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Password"
                    className="w-full bg-bg border-none rounded-2xl pl-12 pr-12 py-4 text-sm focus:ring-2 focus:ring-ink outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>

                {authError && (
                  <p className="text-red-500 text-sm text-center">{authError}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-ink text-bg py-4 rounded-2xl font-medium hover:bg-opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <span>{authMode === "login" ? "Sign In" : "Sign Up"}</span>}
                </button>
              </form>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border-color"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-surface px-2 text-muted tracking-widest">Or continue with</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-surface border-2 border-border-color text-ink py-4 rounded-2xl font-medium hover:bg-bg transition-all flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Google</span>
              </button>

              <p className="mt-8 text-center text-sm text-muted">
                {authMode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}
                  className="text-ink font-semibold hover:underline"
                >
                  {authMode === "login" ? "Sign Up" : "Sign In"}
                </button>
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}






