import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Image as ImageIcon, Palette, Trash2, StopCircle, Loader2, Camera, Bot, GraduationCap, Book, Bookmark, X } from 'lucide-react';
import { ai, MODELS } from './lib/gemini';
import { ChatMessage } from './components/ChatMessage';
import { cn } from './lib/utils';
import { Modality } from "@google/genai";

// Types
interface LessonData {
  english: string;
  example_en: string;
  example_ar: string;
  image_prompt: string;
  image_url?: string;
  timestamp: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string; // Base64 or URL
  lessonData?: LessonData;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'أهلاً بك يا مصطفى! أنا "ذكي" (دحروج)، مساعدك الشخصي. كيف يمكنني مساعدتك اليوم؟ يمكنني التحدث، الرسم، وتحليل الصور.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [library, setLibrary] = useState<LessonData[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load library from local storage
  useEffect(() => {
    const savedLibrary = localStorage.getItem('mustafa_library');
    if (savedLibrary) {
      setLibrary(JSON.parse(savedLibrary));
    }
  }, []);

  // Save library to local storage
  useEffect(() => {
    localStorage.setItem('mustafa_library', JSON.stringify(library));
  }, [library]);

  const addToLibrary = (lesson: LessonData) => {
    if (library.some(l => l.english === lesson.english)) return; // Prevent duplicates
    setLibrary(prev => [lesson, ...prev]);
  };

  const removeFromLibrary = (timestamp: number) => {
    setLibrary(prev => prev.filter(l => l.timestamp !== timestamp));
  };

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speech Recognition Setup
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('عذراً، متصفحك لا يدعم تحويل الصوت إلى نص.');
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = 'ar-SA'; // Arabic Saudi Arabia
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      
      setInput(prev => {
        const trimmed = prev.trim();
        // Check for "Teach Me" prefix
        if (trimmed === "علمني:" || trimmed === "علمني") {
           // Avoid duplication if user said the command too
           if (transcript.trim().startsWith("علمني")) return transcript;
           return "علمني: " + transcript;
        }
        // Check for "Draw Me" prefix
        if (trimmed === "ارسم لي" || trimmed === "ارسم لي:") {
           if (transcript.trim().startsWith("ارسم")) return transcript;
           return "ارسم لي " + transcript;
        }
        return transcript;
      });
      
      // Optional: Auto-send after voice
      // handleSend(transcript); 
    };

    recognition.start();
  };

  // Text to Speech
  const speak = async (text: string) => {
    try {
      // Stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      // Use Gemini TTS
      const response = await ai.models.generateContent({
        model: MODELS.TTS,
        contents: [{ parts: [{ text: text.substring(0, 300) }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        // Try to play directly first (if it has a header)
        try {
          const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
          await audio.play();
          audioRef.current = audio;
        } catch (e) {
          console.log("Direct playback failed, trying PCM decoding...");
          // If direct playback fails, assume Raw PCM (24kHz, mono) and decode
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const binaryString = window.atob(base64Audio);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Create a WAV header for the PCM data (assuming 24kHz, 1 channel, 16-bit)
          // This is a hack but often works for raw PCM from these APIs
          const wavHeader = new ArrayBuffer(44);
          const view = new DataView(wavHeader);
          const sampleRate = 24000;
          const numChannels = 1;
          const bitsPerSample = 16;
          
          // RIFF identifier
          writeString(view, 0, 'RIFF');
          // file length
          view.setUint32(4, 36 + len, true);
          // RIFF type
          writeString(view, 8, 'WAVE');
          // format chunk identifier
          writeString(view, 12, 'fmt ');
          // format chunk length
          view.setUint32(16, 16, true);
          // sample format (1 is PCM)
          view.setUint16(20, 1, true);
          // channel count
          view.setUint16(22, numChannels, true);
          // sample rate
          view.setUint32(24, sampleRate, true);
          // byte rate (sampleRate * blockAlign)
          view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
          // block align (numChannels * bitsPerSample / 8)
          view.setUint16(32, numChannels * (bitsPerSample / 8), true);
          // bits per sample
          view.setUint16(34, bitsPerSample, true);
          // data chunk identifier
          writeString(view, 36, 'data');
          // data chunk length
          view.setUint32(40, len, true);

          const wavBytes = new Uint8Array(wavHeader.byteLength + len);
          wavBytes.set(new Uint8Array(wavHeader), 0);
          wavBytes.set(bytes, wavHeader.byteLength);
          
          const blob = new Blob([wavBytes], { type: 'audio/wav' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          await audio.play();
          audioRef.current = audio;
        }
      }
    } catch (error) {
      console.error("TTS Error:", error);
      // Fallback to browser TTS
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Core Logic
  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if ((!text.trim() && !selectedImage) || isProcessing) return;

    const userMsgId = Date.now().toString();
    const newUserMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: text,
      image: selectedImage || undefined
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInput('');
    setSelectedImage(null);
    setIsProcessing(true);

    try {
      let responseText = '';

      // 1. Teach Me English Mode
      if (text.trim().startsWith('علمني:') || text.trim().startsWith('علمني')) {
        const term = text.replace(/^علمني:?/, '').trim();
        if (!term) return;

        // 1. Get Translation & Educational Content
        const eduResponse = await ai.models.generateContent({
          model: MODELS.TEXT,
          contents: `Act as an English teacher. The user wants to learn: "${term}". 
          1. Translate it to English.
          2. Provide a simple example sentence in English using it.
          3. Translate the example to Arabic.
          4. Create a visual description for a cartoon image to explain it.
          
          Return ONLY valid JSON in this format:
          {
            "english": "...",
            "example_en": "...",
            "example_ar": "...",
            "image_prompt": "..."
          }`,
          config: {
            responseMimeType: "application/json"
          }
        });

        const eduData = JSON.parse(eduResponse.text || "{}");
        
        // 2. Generate Cartoon Image
        let imageUrl = undefined;
        try {
          const imageResponse = await ai.models.generateContent({
            model: MODELS.IMAGE_GEN,
            contents: {
              parts: [{ text: `Cartoon illustration, educational style, colorful, clear lines: ${eduData.image_prompt}` }]
            }
          });
          
          if (imageResponse.candidates?.[0]?.content?.parts) {
            for (const part of imageResponse.candidates[0].content.parts) {
              if (part.inlineData) {
                imageUrl = `data:image/jpeg;base64,${part.inlineData.data}`;
                break;
              }
            }
          }
        } catch (e) {
          console.error("Image gen failed", e);
        }

        // 3. Construct Response
        const finalContent = `
**درس لغة إنجليزية 🇬🇧**

**الكلمة/العبارة:**
# ${eduData.english}

**مثال:**
${eduData.example_en}

**الترجمة:**
${eduData.example_ar}
        `;

        const lessonData: LessonData = {
          english: eduData.english,
          example_en: eduData.example_en,
          example_ar: eduData.example_ar,
          image_prompt: eduData.image_prompt,
          image_url: imageUrl,
          timestamp: Date.now()
        };

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: finalContent,
          image: imageUrl,
          lessonData: lessonData
        }]);

        // 4. Speak (English parts)
        speak(`${eduData.english}. ${eduData.example_en}`);
        
        setIsProcessing(false);
        return;
      }

      // 2. Image Generation Command Check
      // Improved detection logic: check for "draw", "imagine", "picture of" in Arabic
      const lowerText = text.toLowerCase();
      const isDrawRequest = 
        lowerText.includes('ارسم') || 
        lowerText.includes('تخيل') || 
        lowerText.includes('صورة ل') ||
        lowerText.includes('draw') ||
        lowerText.includes('generate image');

      if (isDrawRequest && !newUserMsg.image) {
        const prompt = text.replace(/^(ارسم|تخيل|صورة ل|draw|generate image)/i, '').trim();
        const finalPrompt = prompt || "صورة فنية جميلة"; // Default prompt if empty
        
        // Translate prompt to English for better generation results
        let englishPrompt = finalPrompt;
        try {
           const translationResponse = await ai.models.generateContent({
            model: MODELS.TEXT,
            contents: `Translate this image description to English for an image generator, keep it descriptive but concise: "${finalPrompt}"`,
          });
          if (translationResponse.text) {
            englishPrompt = translationResponse.text.trim();
          }
        } catch (e) {
          console.error("Translation failed, using original prompt");
        }

        // Use Gemini Image Generation instead of Pollinations
        try {
          const imageResponse = await ai.models.generateContent({
            model: MODELS.IMAGE_GEN,
            contents: {
              parts: [{ text: englishPrompt }]
            }
          });
          
          // Extract the image from the response
          // The response structure for images usually contains inlineData
          let generatedImageBase64 = null;
          
          if (imageResponse.candidates?.[0]?.content?.parts) {
            for (const part of imageResponse.candidates[0].content.parts) {
              if (part.inlineData) {
                generatedImageBase64 = part.inlineData.data;
                break;
              }
            }
          }

          if (generatedImageBase64) {
             const imageUrl = `data:image/jpeg;base64,${generatedImageBase64}`;
             responseText = `تفضل يا مصطفى، هذه رسمة "${finalPrompt}" التي طلبتها!`;
             
             setMessages(prev => [...prev, {
              id: Date.now().toString(),
              role: 'assistant',
              content: responseText,
              image: imageUrl
            }]);
            
            speak(responseText);
          } else {
             throw new Error("No image data returned");
          }

        } catch (genError) {
          console.error("Gemini Image Gen failed, falling back to Pollinations:", genError);
          // Fallback to Pollinations if Gemini fails
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(englishPrompt)}?width=1024&height=1024&model=flux&seed=${Math.floor(Math.random() * 1000)}`;
          responseText = `تفضل يا مصطفى، هذه رسمة "${finalPrompt}" التي طلبتها!`;
          
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            content: responseText,
            image: imageUrl
          }]);
          
          speak(responseText);
        }
        
        setIsProcessing(false);
        return;
      }

      // 2. Vision or Text Chat
      let result;
      
      if (newUserMsg.image) {
        // Vision Task
        const base64Data = newUserMsg.image.split(',')[1];
        const mimeType = newUserMsg.image.split(';')[0].split(':')[1];

        const response = await ai.models.generateContent({
          model: MODELS.VISION,
          contents: {
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: text || "صف هذه الصورة لي بالعربية." }
            ]
          }
        });
        result = response;
      } else {
        // Regular Text Chat
        const response = await ai.models.generateContent({
          model: MODELS.TEXT,
          contents: text,
          config: {
            // Explicitly force Arabic and persona
            systemInstruction: "أنت 'ذكي' (دحروج)، مساعد شخصي للمستخدم 'مصطفى'. \n1. تحدث **فقط** باللغة العربية.\n2. كن مرحاً وودوداً جداً.\n3. إذا حياك المستخدم (السلام عليكم، مرحبا)، رد بتحية حارة.\n4. أنت تحب الرسم وتحليل الصور.",
          }
        });
        result = response;
      }

      responseText = result.text || "عذراً، لم أستطع فهم ذلك.";
      
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: responseText
      }]);

      speak(responseText);

    } catch (error) {
      console.error("Error:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "عذراً، حدث خطأ أثناء المعالجة. تأكد من الاتصال بالإنترنت وحاول مرة أخرى."
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: 'تم مسح الذاكرة. أنا جاهز للبدء من جديد يا مصطفى!'
    }]);
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden selection:bg-emerald-500/30">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-zinc-900/50 border-b border-white/5 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/20">
            <Bot className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
              Mustafa AI
            </h1>
            <p className="text-xs text-zinc-500 font-mono tracking-wider">DAHROUG EDITION v2.0</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLibrary(!showLibrary)}
            className={cn(
              "px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-all",
              showLibrary 
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" 
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            )}
          >
            <Book size={16} />
            {showLibrary ? "إغلاق المكتبة" : "المكتبة"}
            {library.length > 0 && (
              <span className="bg-emerald-600 text-white text-[10px] px-1.5 rounded-full min-w-[18px] text-center">
                {library.length}
              </span>
            )}
          </button>
          <div className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            متصل
          </div>
        </div>
      </header>

      {/* Library View Overlay */}
      {showLibrary && (
        <div className="absolute inset-0 top-[73px] z-20 bg-zinc-950/95 backdrop-blur-sm overflow-y-auto p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Book className="text-emerald-500" />
                مكتبتي التعليمية
              </h2>
              <button onClick={() => setShowLibrary(false)} className="p-2 hover:bg-zinc-800 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            {library.length === 0 ? (
              <div className="text-center py-20 text-zinc-500">
                <Book size={48} className="mx-auto mb-4 opacity-20" />
                <p>المكتبة فارغة حالياً.</p>
                <p className="text-sm mt-2">اطلب من دحروج "علمني كلمة..." ثم اضغط حفظ!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {library.map((lesson) => (
                  <div key={lesson.timestamp} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden hover:border-emerald-500/30 transition-all group">
                    {lesson.image_url && (
                      <div className="relative h-48 overflow-hidden">
                        <img src={lesson.image_url} alt={lesson.english} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        <button 
                          onClick={() => speak(`${lesson.english}. ${lesson.example_en}`)}
                          className="absolute bottom-2 right-2 p-2 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-emerald-500 transition-colors"
                        >
                          <Mic size={16} />
                        </button>
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-xl font-bold text-emerald-400">{lesson.english}</h3>
                        <button 
                          onClick={() => removeFromLibrary(lesson.timestamp)}
                          className="text-zinc-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <p className="text-zinc-300 text-sm mb-3">{lesson.example_en}</p>
                      <div className="pt-3 border-t border-zinc-800">
                        <p className="text-zinc-500 text-xs text-right" dir="rtl">{lesson.example_ar}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className="relative group">
              <ChatMessage role={msg.role} content={msg.content} image={msg.image} />
              {msg.lessonData && (
                <div className="absolute -bottom-3 left-14 z-10">
                   <button
                    onClick={() => addToLibrary(msg.lessonData!)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-full text-xs text-emerald-400 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all shadow-lg"
                   >
                     <Bookmark size={12} />
                     حفظ في المكتبة
                   </button>
                </div>
              )}
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start animate-pulse">
              <div className="flex items-center gap-2 text-zinc-500 text-sm bg-zinc-900/50 px-4 py-2 rounded-full">
                <Loader2 className="animate-spin" size={14} />
                جاري التفكير...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="p-4 bg-zinc-900/80 border-t border-white/5 backdrop-blur-lg">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          
          {/* Image Preview */}
          {selectedImage && (
            <div className="relative w-fit group">
              <img src={selectedImage} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-emerald-500/30" />
              <button 
                onClick={() => setSelectedImage(null)}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}

          {/* Controls & Input */}
          <div className="flex items-end gap-2">
            
            {/* Action Buttons (Left) */}
            <div className="flex gap-2 pb-1">
              <button 
                onClick={clearChat}
                className="p-3 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20"
                title="مسح الذاكرة"
              >
                <Trash2 size={20} />
              </button>
              
              <button 
                onClick={() => setInput("علمني: ")}
                className="p-3 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-blue-500/10 hover:text-blue-400 transition-all border border-transparent hover:border-blue-500/20"
                title="تعليم إنجليزي"
              >
                <GraduationCap size={20} />
              </button>

              <button 
                onClick={() => setInput("ارسم لي ")}
                className="p-3 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-orange-500/10 hover:text-orange-400 transition-all border border-transparent hover:border-orange-500/20"
                title="ارسم لي"
              >
                <Palette size={20} />
              </button>
              
              <button 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "p-3 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-indigo-500/10 hover:text-indigo-400 transition-all border border-transparent hover:border-indigo-500/20",
                  selectedImage && "text-indigo-400 bg-indigo-500/10 border-indigo-500/20"
                )}
                title="رفع صورة"
              >
                <ImageIcon size={20} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleImageUpload}
              />
            </div>

            {/* Text Input */}
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={selectedImage ? "ماذا تريد أن تعرف عن هذه الصورة؟" : "تحدث مع دحروج... (جرب: ارسم قطة)"}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-3 pr-12 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none min-h-[56px] max-h-32"
                rows={1}
              />
              <div className="absolute left-2 bottom-2">
                 {/* Placeholder for future features */}
              </div>
            </div>

            {/* Voice & Send (Right) */}
            <div className="flex gap-2 pb-1">
              <button
                onClick={isListening ? () => setIsListening(false) : startListening}
                className={cn(
                  "p-3 rounded-xl transition-all border",
                  isListening 
                    ? "bg-red-500 text-white animate-pulse border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)]" 
                    : "bg-zinc-800 text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-400 border-transparent hover:border-emerald-500/20"
                )}
                title="تحدث"
              >
                {isListening ? <StopCircle size={20} /> : <Mic size={20} />}
              </button>

              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && !selectedImage) || isProcessing}
                className="p-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/20"
              >
                {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="rtl:rotate-180" />}
              </button>
            </div>
          </div>
          
          <div className="text-center">
             <p className="text-[10px] text-zinc-600">
               مدعوم بواسطة Google Gemini & Pollinations AI
             </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
