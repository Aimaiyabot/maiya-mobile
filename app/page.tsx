"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import dynamic from "next/dynamic";
import emojiData from "@emoji-mart/data";
import DownloadButton from "@/app/api/components/DownloadButton";
import { useRouter } from "next/navigation";
import type { Database } from '../lib/database.types';

// Prevent emoji picker from causing SSR issues
const Picker = dynamic(
  () => import("@emoji-mart/react").then((mod) => mod.default),
  { 
    ssr: false,
    loading: () => null 
  }
);

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

type Profile = Database['public']['Tables']['profiles']['Row'];
type ChatMessage = Database['public']['Tables']['chats']['Row'];

export default function Home() {
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedDate, setSelectedDate] = useState("Today");
  const [savedDates, setSavedDates] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [userName, setUserName] = useState("");
  const [userNiche, setUserNiche] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isProfileSaved, setIsProfileSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imagePromptRef = useRef(false);
  const isInitialMount = useRef(true);

  // Memoize functions that don't need to be recreated on every render
  const getTodayKey = useCallback(() => new Date().toISOString().split("T")[0], []);

  const loadHistory = async (key: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data, error } = await supabase.from("chats").select("messages").eq("date_key", key).eq("user_id", user.id).single();
      
      if (error) {
        console.error("Error loading chat history:", error);
        return;
      }
      
      setMessages(data?.messages || []);
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  };

  const saveHistory = async (msgs: Message[]) => {
    if (!msgs?.length) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }

      const todayKey = getTodayKey();
      
      await supabase
        .from("chats")
        .upsert({
          user_id: user.id,
          date_key: todayKey,
          messages: msgs,
          updated_at: new Date().toISOString()
        });

      // Update saved dates if needed
      if (!savedDates.includes(todayKey)) {
        setSavedDates(prev => Array.from(new Set([...prev, todayKey])));
      }
    } catch (error) {
      console.error("Error saving chat history:", error);
    }
  };

  const generateAndSaveSummary = async (chatMessages: Message[]) => {
    try {
      const todayKey = getTodayKey();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch("/api/maiyabot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: chatMessages,
          name: userName,
          niche: userNiche,
          summarize: true,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(`Failed to summarize: ${errorData.error || res.statusText}`);
      }

      const data = await res.json();
      const summary = data.summary || data.reply;

      const { error } = await supabase.from("summaries").upsert({ 
        user_id: user.id, 
        date_key: todayKey, 
        summary 
      });
      
      if (error) {
        console.error("Error saving summary to database:", error);
      }
    } catch (error) {
      console.error("Failed to generate or save summary:", error);
    }
  };

  const loadUserProfile = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error("Auth error:", authError);
        router.push("/auth");
        return;
      }
    
      if (!user) {
        router.push("/auth");
        return;
      }
    
      setUserEmail(user.email || "");
    
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (profileError) {
        console.error("Error loading profile:", profileError);
        return;
      }
    
      if (data) {
        setUserName(data.name || "");
        setUserNiche(data.niche || "");
    
        // 💖 Trigger shimmer animation
        setShowWelcome(true);
        setTimeout(() => setShowWelcome(false), 3000);
      }
    } catch (error) {
      console.error("Failed to load user profile:", error);
      router.push("/auth");
    }
  };   

  const saveUserProfile = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
    
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        name: userName,
        niche: userNiche
      });
      
      if (error) {
        console.error("Error saving user profile:", error);
        return;
      }
    
      setEditMode(false);
      setIsProfileSaved(true);
    } catch (error) {
      console.error("Failed to save user profile:", error);
    } finally {
      setIsSaving(false);
    }
  };  

  const sendMessage = async (customInput?: string) => {
    if (isSendingMessage) return;
    setIsSendingMessage(true);

    try {
      const content = customInput || input;
      if (!content.trim()) {
        return;
      }

      // Check authentication
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }

      // Create and add user message
      const userMessage = { 
        role: "user" as const, 
        content,
        timestamp: new Date().toISOString()
      };
      
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setIsTyping(true);
      setShowEmojiPicker(false);

      // Save history
      await saveHistory(newMessages);

      // Handle image generation prompt
      if (content.toLowerCase().includes("generate image")) {
        const promptMsg = {
          role: "assistant" as const,
          content: "What kind of image would you like me to create for you, babe? 🎨✨",
          timestamp: new Date().toISOString()
        };
        const updatedMessages = [...newMessages, promptMsg];
        setMessages(updatedMessages);
        await saveHistory(updatedMessages);
        imagePromptRef.current = true;
        setIsTyping(false);
        setIsSendingMessage(false);
        return;
      }

      // Prepare API request
      const isImageRequest = imagePromptRef.current;
      const shouldUseVisualCode = ["infographic", "ebook", "layout", "dashboard", "steps"]
        .some(word => content.toLowerCase().includes(word));

      // Make API request
      const endpoint = isImageRequest
        ? shouldUseVisualCode
          ? "/api/generate-visual-code"
          : "/api/generate-image"
        : "/api/maiyabot";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          name: userName,
          niche: userNiche,
          prompt: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Create assistant message
      const assistantMessage = {
        role: "assistant" as const,
        content: isImageRequest
          ? shouldUseVisualCode
            ? data.html
            : data.fallback
              ? data.message
              : `<img src="${data.imageUrl}" alt="Generated Image" class="rounded-md mt-2 max-w-xs shadow-lg" />`
          : data.reply,
        timestamp: new Date().toISOString()
      };

      // Reset image prompt state
      imagePromptRef.current = false;

      // Update messages
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);
      await saveHistory(updatedMessages);

      // Play sound if not muted
      if (!isMuted && audioRef.current) {
        audioRef.current.play().catch(console.error);
      }

    } catch (error) {
      console.error("Error sending message:", error);
      
      // Reset image prompt state
      imagePromptRef.current = false;

      // Add friendly error message
      const errorMessage = {
        role: "assistant" as const,
        content: "Oops! I hit a glitch 💔 Can you try again, babe?",
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      await saveHistory([...messages, errorMessage]);
      setError(error instanceof Error ? error.message : "Failed to send message");

    } finally {
      setIsSendingMessage(false);
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleEmojiSelect = (emoji: any) => {
    setInput((prev) => prev + emoji.native);
  };

  const getMoodColorClass = (text: string) => {
    const funWords = ["lol", "party", "haha", "yay", "fun", "cute", "style", "vibe"];
    const bizWords = ["marketing", "business", "brand", "sales", "launch", "offer", "strategy"];
    const helpWords = ["help", "how", "what", "why", "when", "where", "can you", "could you"];
    const lower = text.toLowerCase();

    if (bizWords.some((word) => lower.includes(word))) return "bg-blue-100 text-blue-800";
    if (funWords.some((word) => lower.includes(word))) return "bg-pink-100 text-pink-700";
    if (helpWords.some((word) => lower.includes(word))) return "bg-purple-100 text-purple-700";
    
    // Default styles based on message length and content
    if (text.length < 20) return "bg-gray-100 text-gray-800";
    if (text.includes("?")) return "bg-yellow-50 text-yellow-800";
    
    return "bg-white text-gray-800";
  };

  useEffect(() => {
    const todayKey = getTodayKey();
    let isSubscribed = true;
    
    const init = async () => {
      try {
        if (!isSubscribed) return;
        
        // Check authentication first
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          setError("Authentication failed. Please try logging in again.");
          router.push("/auth");
          return;
        }
        
        if (!user) {
          router.push("/auth");
          return;
        }

        // Load all data in parallel
        const [profileResult, chatsResult] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", user.id).single(),
          supabase.from("chats").select("date_key, messages").eq("user_id", user.id)
        ]);

        if (profileResult.error) {
          console.error("Error loading profile:", profileResult.error);
          setError("Failed to load profile data.");
          return;
        }

        if (chatsResult.error) {
          console.error("Error loading chats:", chatsResult.error);
          setError("Failed to load chat history.");
          return;
        }

        if (isSubscribed) {
          // Set profile data
          if (profileResult.data) {
            setUserName(profileResult.data.name || "");
            setUserNiche(profileResult.data.niche || "");
            setUserEmail(user.email || "");
            setShowWelcome(true);
            setTimeout(() => setShowWelcome(false), 3000);
          }

          // Set chat data
          const dates = chatsResult.data.map(chat => chat.date_key);
          setSavedDates([...new Set(dates)]);
          setSelectedDate(todayKey);

          // Load today's messages if they exist
          const todayChat = chatsResult.data.find(chat => chat.date_key === todayKey);
          if (todayChat) {
            setMessages(todayChat.messages || []);
          }
        }
      } catch (error) {
        console.error("Initialization error:", error);
        setError("Failed to initialize the application.");
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
          isInitialMount.current = false;
        }
      }
    };

    init();

    // Cleanup function
    return () => {
      isSubscribed = false;
    };
  }, [router, getTodayKey]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (bottomRef.current && !isLoading) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isLoading]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  // Handle initial loading error
  if (error) {
    return (
      <div className="min-h-screen bg-pink-50 flex items-center justify-center px-4">
        <div className="bg-white p-6 rounded-xl shadow-xl text-center w-full max-w-sm">
          <h2 className="text-xl font-semibold text-pink-500 mb-2">Oops! Something went wrong 💔</h2>
          <p className="text-sm mb-4 text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-pink-500 hover:bg-pink-600 text-white text-sm px-4 py-2 rounded-md shadow mb-2"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (isLoading && isInitialMount.current) {
    return (
      <div className="min-h-screen bg-pink-50 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <img src="/maiya.png" alt="Maiya" className="w-24 h-24 rounded-full mx-auto mb-4 animate-bounce" />
          <p className="text-pink-500">Loading...</p>
        </div>
      </div>
    );
  }

  if ((!userName || !userNiche) && !isProfileSaved) {
    return (
      <div className="min-h-screen bg-pink-50 flex items-center justify-center px-4">
        <div className="bg-white p-6 rounded-xl shadow-xl text-center w-full max-w-sm">
          <h2 className="text-xl font-semibold text-pink-500 mb-2">Babe, tell me your name and biz vibe 💖</h2>
          <p className="text-sm mb-4 text-gray-600">So I can give you the best advice ✨</p>
  
          <input
            className="w-full border border-gray-300 rounded-md p-2 mb-2 text-sm"
            placeholder="Your name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
          <input
            className="w-full border border-gray-300 rounded-md p-2 mb-4 text-sm"
            placeholder="Your biz vibe / niche"
            value={userNiche}
            onChange={(e) => setUserNiche(e.target.value)}
          />
          
          <button
            onClick={saveUserProfile}
            disabled={isSaving}
            className={`bg-pink-500 hover:bg-pink-600 text-white text-sm px-4 py-2 rounded-md shadow mb-2 w-full ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSaving ? 'Saving...' : 'Save & Start Chatting'}
          </button>
        </div>
      </div>
    );
  }  

  return (
    <div className="min-h-screen bg-pink-50 flex flex-col md:flex-row">  
      {showWelcome && (
        <div className="fixed top-1 left-1/2 transform -translate-x-1/2 z-50 bg-white border border-pink-200 px-2 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-shimmer md:top-6 md:px-6 md:py-3 md:gap-3">
          <img src="/maiya.png" alt="Maiya" className="w-6 h-6 rounded-full animate-bounce md:w-10 md:h-10" />
          <span className="text-pink-600 text-[11px] font-medium md:text-sm">Hey babe, welcome back! 💕</span>
        </div>
      )}
      <div className="hidden md:block w-64 p-6 bg-white shadow-lg">
        <div className="text-center">
          <img src="/maiya.png" alt="Maiya" className="w-24 h-24 rounded-full mx-auto mb-4 shadow-md" />
          <h1 className="text-2xl font-bold text-pink-600">Hi, I'm Maiya 💖</h1>
          <p className="text-sm mt-2">Your cute AI business bestie. Ask me anything about digital marketing, passive income, or branding!</p>

          {!editMode ? (
            <>
              {userName && userNiche && (
                <p className="text-xs mt-4 text-pink-400">Welcome back {userName}! Ready to grow your {userNiche} biz? 💼💅</p>
              )}
              {userEmail && (
                <p className="text-xs mt-1 text-gray-400 italic truncate max-w-[90%] mx-auto">{userEmail}</p>
              )}
              <div className="flex flex-col items-center justify-center gap-1 mt-2">
                <button className="text-xs text-pink-500 underline" onClick={() => setEditMode(true)}>
                  Edit Profile
                </button>
                <button className="text-xs text-red-500 underline" onClick={async () => {
                  try {
                    const { error } = await supabase.auth.signOut();
                    if (error) {
                      console.error("Error signing out:", error);
                      return;
                    }
                    router.push("/auth");
                  } catch (error) {
                    console.error("Failed to sign out:", error);
                  }
                }}>
                  Logout
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4 space-y-2 text-left px-0">
              <input
                className="w-full border border-gray-300 rounded-md p-1.5 text-[11px]"
                placeholder="Your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
              <input
                className="w-full border border-gray-300 rounded-md p-1.5 text-[11px]"
                placeholder="Your niche"
                value={userNiche}
                onChange={(e) => setUserNiche(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  className="text-[11px] bg-pink-500 text-white px-3 py-1 rounded"
                  onClick={() => {
                    saveUserProfile();
                  }}
                >
                  Save
                </button>
                <button
                  className="text-[11px] text-gray-500"
                  onClick={() => {
                    setEditMode(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          <label className="block text-sm font-semibold mb-2">Chat History</label>
          <select className="w-full border border-gray-300 rounded-md p-2 text-sm" value={selectedDate} onChange={(e) => {
            const date = e.target.value;
            setSelectedDate(date);
            loadHistory(date);
          }}>
            {savedDates.map((date) => (
              <option key={date} value={date}>{date === getTodayKey() ? 'Today' : date}</option>
            ))}
          </select>
          <button onClick={async () => {
            try {
              const { error } = await supabase.from("chats").delete().eq("date_key", selectedDate);
              if (error) {
                console.error("Error clearing chat:", error);
                return;
              }
              setMessages([]);
            } catch (error) {
              console.error("Failed to clear chat:", error);
            }
          }} className="text-sm text-pink-500 underline mt-4">
            Clear Chat
          </button>
        </div>
      </div>

      <div className="md:hidden w-full bg-white shadow-lg">
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center gap-2">
            <img src="/maiya.png" alt="Maiya" className="w-8 h-8 rounded-full shadow-md" />
            <h1 className="text-lg font-bold text-pink-600">Maiya 💖</h1>
          </div>
          <button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="text-pink-500 p-1.5 hover:bg-pink-50 rounded-full"
          >
            {showMobileMenu ? '✕' : '☰'}
          </button>
        </div>

        {showMobileMenu && (
          <div className="absolute top-[48px] right-0 w-64 bg-white shadow-lg rounded-bl-xl z-50 border border-pink-100">
            <div className="p-3 space-y-3">
              <div className="border-b border-pink-100 pb-2">
                <p className="text-[11px] text-pink-400">Welcome, {userName}!</p>
                <p className="text-[10px] text-gray-400 italic truncate">{userEmail}</p>
                <p className="text-[10px] text-gray-500">{userNiche} business</p>
              </div>

              {!editMode ? (
                <div className="space-y-2">
                  <button 
                    className="w-full text-left text-[11px] text-pink-500 hover:bg-pink-50 p-1.5 rounded"
                    onClick={() => {
                      setEditMode(true);
                      setShowMobileMenu(false);
                    }}
                  >
                    ✏️ Edit Profile
                  </button>
                  <div className="border-t border-pink-100 pt-2">
                    <label className="block text-[11px] font-semibold mb-1.5">Chat History</label>
                    <select 
                      className="w-full border border-gray-300 rounded-md p-1.5 text-[11px] mb-2"
                      value={selectedDate}
                      onChange={(e) => {
                        const date = e.target.value;
                        setSelectedDate(date);
                        loadHistory(date);
                        setShowMobileMenu(false);
                      }}
                    >
                      {savedDates.map((date) => (
                        <option key={date} value={date}>{date === getTodayKey() ? 'Today' : date}</option>
                      ))}
                    </select>
                    <button 
                      onClick={async () => {
                        const { error } = await supabase.from("chats").delete().eq("date_key", selectedDate);
                        if (error) {
                          console.error("Error clearing chat:", error);
                          return;
                        }
                        setMessages([]);
                        setShowMobileMenu(false);
                      }}
                      className="text-[11px] text-pink-500 hover:bg-pink-50 p-1.5 rounded w-full text-left"
                    >
                      🗑️ Clear Chat
                    </button>
                  </div>
                  <button 
                    className="w-full text-left text-[11px] text-red-500 hover:bg-pink-50 p-1.5 rounded border-t border-pink-100 mt-2"
                    onClick={async () => {
                      try {
                        const { error } = await supabase.auth.signOut();
                        if (error) {
                          console.error("Error signing out:", error);
                          return;
                        }
                        router.push("/auth");
                      } catch (error) {
                        console.error("Failed to sign out:", error);
                      }
                    }}
                  >
                    🚪 Logout
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    className="w-full border border-gray-300 rounded-md p-1.5 text-[11px]"
                    placeholder="Your name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                  />
                  <input
                    className="w-full border border-gray-300 rounded-md p-1.5 text-[11px]"
                    placeholder="Your niche"
                    value={userNiche}
                    onChange={(e) => setUserNiche(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      className="text-[11px] bg-pink-500 text-white px-3 py-1 rounded"
                      onClick={() => {
                        saveUserProfile();
                        setShowMobileMenu(false);
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="text-[11px] text-gray-500"
                      onClick={() => {
                        setEditMode(false);
                        setShowMobileMenu(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between items-center px-1.5 py-2 relative md:px-6 md:py-8">
        <div className="w-full max-w-6xl overflow-y-auto mb-4 pb-40 md:pb-28" style={{ maxHeight: "calc(100vh - 140px)" }}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex items-start gap-1.5 mb-2 ${msg.role === "user" ? "justify-end flex-row-reverse" : "justify-start"} md:gap-2 md:mb-4`}>
              <img src={msg.role === "user" ? "/user-avatar.png" : "/maiya.png"} alt={msg.role === "user" ? "You" : "Maiya"} className="w-5 h-5 rounded-full shadow-md md:w-8 md:h-8" />
              <div
                className={`rounded-xl px-2.5 py-1.5 w-full max-w-[88vw] whitespace-pre-line text-[11px] ${
                  msg.role === "user" ? "bg-pink-100 text-pink-700 self-end" : `${getMoodColorClass(msg.content)} shadow-md self-start`
                } md:px-4 md:py-3 md:max-w-5xl md:text-sm`}
              >
                <strong>{msg.role === "user" ? "You" : "Maiya"}:</strong>{" "}
                {msg.role === "assistant" && msg.content.includes("<img") ? (
                  <div className="flex flex-col items-start">
                    <div className="inline-block border border-pink-200 rounded-xl overflow-hidden shadow-md max-w-full">
                      <img
                        src={msg.content.match(/src="([^"]+)"/)?.[1] || ""}
                        alt="Generated Image"
                        className="w-full h-auto block"
                      />
                    </div>
                    <div className="mt-1.5 md:mt-2">
                      <DownloadButton url={msg.content.match(/src="([^"]+)"/)?.[1] || ""} />
                    </div>
                  </div>
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-1.5 mb-2 animate-pulse md:gap-2 md:mb-4">
              <img src="/maiya.png" alt="Maiya" className="w-5 h-5 rounded-full shadow-md md:w-8 md:h-8" />
              <div className="bg-white px-2.5 py-1.5 rounded-xl shadow text-[11px] text-gray-600 md:px-4 md:py-2 md:text-sm">Maiya is thinking...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="fixed bottom-2 w-full max-w-4xl px-1.5 pb-safe md:bottom-8 md:px-1">
          <div className="flex flex-wrap justify-center gap-1.5 mb-2 md:gap-4 md:mb-4">
            {[{ icon: "💌", label: "Write an email" }, { icon: "📈", label: "Digital marketing tips" }, { icon: "💰", label: "Passive income ideas" }, { icon: "🎨", label: "Generate image" }, { icon: "✍️", label: "Write a story" }].map(({ icon, label }) => (
              <button
                key={label}
                onClick={() => sendMessage(label)}
                className="bg-pink-100 hover:bg-pink-200 text-[11px] text-pink-700 px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 md:text-sm md:px-3 md:py-1 md:gap-2"
              >
                <span>{icon}</span> <span className="hidden xs:inline md:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex bg-white border border-pink-300 rounded-full shadow-lg p-3 items-center relative md:p-1 mb-3">
            <button onClick={() => setShowEmojiPicker((prev) => !prev)} className="text-base px-1.5 md:text-xl md:px-3">😊</button>
            <textarea
              rows={1}
              placeholder="Ask Maiya something..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-2 py-0.5 text-[11px] border-none focus:outline-none resize-none bg-transparent md:px-4 md:py-2 md:text-sm"
            />
            <button onClick={() => setIsMuted(!isMuted)} className="mr-1 text-sm text-pink-500 md:mr-2" title={isMuted ? "Unmute sound" : "Mute sound"}>
              {isMuted ? "🔇" : "🔔"}
            </button>
            <button 
              onClick={() => sendMessage()} 
              disabled={isSendingMessage}
              className={`bg-pink-500 hover:bg-pink-600 text-white rounded-full w-6 h-6 flex items-center justify-center md:w-10 md:h-10 ${isSendingMessage ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isSendingMessage ? '...' : '➤'}
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-10 left-0 z-50 transform scale-75 origin-bottom-left md:bottom-14 md:scale-100">
                <Picker data={emojiData} onEmojiSelect={handleEmojiSelect} />
              </div>
            )}
          </div>
          <div className="message-bottom-text text-[5px] text-center mt-0.5 md:text-sm md:mt-1">⚡ Maiya gives her best advice, but babe, always double-check important info!</div>
        </div>
      </div>

      <audio ref={audioRef} src="/maiya-chime/sound.wav" preload="auto" />
    </div>
  );
}
