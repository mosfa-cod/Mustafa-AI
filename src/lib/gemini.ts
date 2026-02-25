import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini API client
// We use the environment variable directly as per guidelines
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const MODELS = {
  TEXT: "gemini-3-flash-preview", // Latest Flash model
  VISION: "gemini-3-flash-preview", // Flash is multimodal
  TTS: "gemini-2.5-flash-preview-tts", // Text-to-speech model
  IMAGE_GEN: "gemini-2.5-flash-image", // Image generation model
};
