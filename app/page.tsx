"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import dynamic from "next/dynamic";
import emojiData from "@emoji-mart/data";

const Picker = dynamic(() => import("@emoji-mart/react").then((mod) => mod.default), { ssr: false });

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedDate, setSelectedDate] = useState("Today");
  const [savedDates, setSavedDates] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [userName, setUserName] = useState("");
  const [userNiche, setUserNiche] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const imagePromptRef = useRef(false); // NEW: image prompt tracker

  const getTodayKey = () => new Date().toISOString().split("T")[0];

  const loadHistory = async (key: string) => {
    const { data } = await supabase.from("chats").select("messages").eq("date", key).single();
    setMessages(data?.messages || []);
  };

  const saveHistory = async (msgs: Message[]) => {
    const todayKey = getTodayKey();
    await supabase.from("chats").upsert({ date: todayKey, messages: msgs });
    if (!savedDates.includes(todayKey)) {
      setSavedDates([...savedDates, todayKey]);
    }
  };

  const loadUserProfile = async () => {
    const { data } = await supabase.from("profiles").select("*").single();
    if (data) {
      setUserName(data.name || "");
      setUserNiche(data.niche || "");
    }
  };

  const saveUserProfile = async () => {
    await supabase.from("profiles").upsert({ name: userName, niche: userNiche });
    setEditMode(false);
  };

  const sendMessage = async (customInput?: string) => {
    const content = customInput || input;
    if (!content.trim()) return;

    const userMessage: Message = { role: "user", content };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsTyping(true);
    setShowEmojiPicker(false);
    await saveHistory(updatedMessages);

    try {
      if (content.toLowerCase().trim() === "generate image") {
        const promptMsg: Message = {
          role: "assistant",
          content: "What kind of image would you like me to create for you, babe? 🎨✨",
        };
        const final = [...updatedMessages, promptMsg];
        setMessages(final);
        await saveHistory(final);
        imagePromptRef.current = true;
        return;
      }

      const invalidKeywords = ["dog", "cat", "person", "people", "human"];
      const lastWasImagePrompt = imagePromptRef.current;
      const isImageDescription =
        lastWasImagePrompt &&
        content.length > 10 &&
        content.split(" ").length > 2 &&
        !invalidKeywords.some((kw) => content.toLowerCase().includes(kw));

      const res = await fetch(isImageDescription ? "/api/generate-image" : "/api/maiyabot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          name: userName,
          niche: userNiche,
          prompt: content,
        }),
      });

      if (!res.ok) throw new Error("Network response was not ok.");

      if (lastWasImagePrompt && !isImageDescription) {
        imagePromptRef.current = false;
        const reply: Message = {
          role: "assistant",
          content: `I can't generate images of specific things like dogs or cats, but I can help you find cute pics online! 🐶💖<br />Try sites like <a href="https://unsplash.com/s/photos/cute-dog" target="_blank" class="underline text-pink-500">Unsplash</a> or <a href="https://www.pexels.com/search/cute%20dog/" target="_blank" class="underline text-pink-500">Pexels</a> for royalty-free options! ✨📸`,
        };
        const final = [...updatedMessages, reply];
        setMessages(final);
        await saveHistory(final);
        return;
      }

      const data = await res.json();

      const assistantMessage: Message = isImageDescription
        ? {
            role: "assistant",
            content: `<img src="${data.imageUrl}" alt="Generated Image" class="rounded-md mt-2 max-w-xs shadow-lg" />`,
          }
        : { role: "assistant", content: data.reply };

      imagePromptRef.current = false;
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveHistory(finalMessages);

      if (!isMuted && audioRef.current) {
        audioRef.current.play();
      }
    } catch (err) {
      imagePromptRef.current = false;
      const fallback: Message[] = [...updatedMessages, { role: "assistant", content: "Oops! I hit a glitch 💔 Can you try again, babe?" }];
      setMessages(fallback);
      await saveHistory(fallback);
    } finally {
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
    const lower = text.toLowerCase();

    if (bizWords.some((word) => lower.includes(word))) return "bg-blue-100 text-blue-800";
    if (funWords.some((word) => lower.includes(word))) return "bg-pink-100 text-pink-700";
    return "bg-white text-gray-800";
  };

  useEffect(() => {
    const todayKey = getTodayKey();
    const init = async () => {
      await loadHistory(todayKey);
      await loadUserProfile();
      const { data } = await supabase.from("chats").select("date");
      setSavedDates(data ? [...new Set(data.map((entry) => entry.date))] : [todayKey]);
      setSelectedDate(todayKey);
    };
    init();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="min-h-screen bg-pink-50 flex">
      <div className="w-64 p-6 bg-white shadow-lg">
        <div className="text-center">
          <img src="/maiya.png" alt="Maiya" className="w-24 h-24 rounded-full mx-auto mb-4 shadow-md" />
          <h1 className="text-2xl font-bold text-pink-600">Hi, I'm Maiya 💖</h1>
          <p className="text-sm mt-2">Your cute AI business bestie. Ask me anything about digital marketing, passive income, or branding!</p>

          {!editMode ? (
            <>
              {userName && userNiche && (
                <p className="text-xs mt-4 text-pink-400">Welcome back {userName}! Ready to grow your {userNiche} biz? 💼💅</p>
              )}
              <button className="text-xs text-pink-500 underline mt-2" onClick={() => setEditMode(true)}>
                Edit Profile
              </button>
            </>
          ) : (
            <div className="mt-4 space-y-2 text-left">
              <input className="w-full border border-gray-300 rounded-md p-2 text-xs" placeholder="Your name" value={userName} onChange={(e) => setUserName(e.target.value)} />
              <input className="w-full border border-gray-300 rounded-md p-2 text-xs" placeholder="Your niche" value={userNiche} onChange={(e) => setUserNiche(e.target.value)} />
              <div className="flex gap-2 mt-1">
                <button className="text-xs bg-pink-500 text-white px-3 py-1 rounded" onClick={saveUserProfile}>
                  Save
                </button>
                <button className="text-xs text-gray-500 underline" onClick={() => setEditMode(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6">
          <label className="block text-sm font-semibold mb-2">Chat History</label>
          <select className="w-full border border-gray-300 rounded-md p-2" value={selectedDate} onChange={(e) => {
            const date = e.target.value;
            setSelectedDate(date);
            loadHistory(date);
          }}>
            {savedDates.map((date) => (
              <option key={date} value={date}>{date === getTodayKey() ? 'Today' : date}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              await supabase.from("chats").delete().eq("date", selectedDate);
              setMessages([]);
            }}
            className="text-sm text-pink-500 underline mt-4"
          >
            Clear Chat
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between items-center px-6 py-8 relative">
        <div className="w-full max-w-4xl overflow-y-auto mb-6 pb-32" style={{ maxHeight: "70vh" }}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex items-start gap-2 mb-4 ${msg.role === "user" ? "justify-end flex-row-reverse" : "justify-start"}`}>
              <img src={msg.role === "user" ? "/user-avatar.png" : "/maiya.png"} alt={msg.role === "user" ? "You" : "Maiya"} className="w-8 h-8 rounded-full shadow-md" />
              <div
                className={`rounded-xl px-4 py-3 max-w-[75%] whitespace-pre-line text-sm ${
                  msg.role === "user" ? "bg-pink-100 text-pink-700 self-end" : `${getMoodColorClass(msg.content)} shadow-md self-start`
                }`}
              >
                <strong>{msg.role === "user" ? "You" : "Maiya"}:</strong>{" "}
                {msg.role === "assistant" ? <span dangerouslySetInnerHTML={{ __html: msg.content }} /> : msg.content}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 mb-4 animate-pulse">
              <img src="/maiya.png" alt="Maiya" className="w-8 h-8 rounded-full shadow-md" />
              <div className="bg-white px-4 py-2 rounded-xl shadow text-sm text-gray-600">Maiya is thinking...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="fixed bottom-6 w-full max-w-2xl px-6">
          <div className="flex flex-wrap justify-center gap-2 mb-2">
            {[
              { icon: "💌", label: "Write an email" },
              { icon: "📈", label: "Digital marketing tips" },
              { icon: "💰", label: "Passive income ideas" },
              { icon: "🎨", label: "Generate image" },
              { icon: "✍️", label: "Write a story" },
            ].map(({ icon, label }) => (
              <button
                key={label}
                onClick={() => sendMessage(label)}
                className="bg-pink-100 hover:bg-pink-200 text-sm text-pink-700 px-3 py-1 rounded-full shadow-sm flex items-center gap-2"
              >
                <span>{icon}</span> <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="flex bg-white border border-pink-300 rounded-full shadow-lg p-2 items-center relative">
            <button onClick={() => setShowEmojiPicker((prev) => !prev)} className="text-xl px-3">
              😊
            </button>
            <textarea
              rows={1}
              placeholder="Ask Maiya something..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 px-4 py-2 text-sm border-none focus:outline-none resize-none bg-transparent"
            />
            <button onClick={() => setIsMuted(!isMuted)} className="mr-2 text-sm text-pink-500" title={isMuted ? "Unmute sound" : "Mute sound"}>
              {isMuted ? "🔇" : "🔔"}
            </button>
            <button onClick={() => sendMessage()} className="bg-pink-500 hover:bg-pink-600 text-white rounded-full w-10 h-10 flex items-center justify-center">
              ➤
            </button>

            {showEmojiPicker && (
              <div className="absolute bottom-14 left-0 z-50">
                <Picker data={emojiData} onEmojiSelect={handleEmojiSelect} />
              </div>
            )}
          </div>
          <div className="message-bottom-text">⚡ Maiya gives her best advice, but babe, always double-check important info please!</div>
        </div>
      </div>

      <audio ref={audioRef} src="/maiya-chime/sound.wav" preload="auto" />
    </div>
  );
}
