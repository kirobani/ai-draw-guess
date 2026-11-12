export const MICU_BASE='https://www.micuapi.ai/v1';
// Availability checked against this account's /v1/models on 2026-10-14.
// M3 passed actual image identification and structured game drawing on 2026-10-14. Other models remain text-only in the picker until verified.
export const MICU_MODELS=['MiniMax-M3','MiniMax-M2.7-highspeed','MiniMax-M2.7','MiniMax-M2.5-highspeed','MiniMax-M2.5','MiniMax-M2.1','MiniMax-M2'].map(id=>({
  id,name:id,family:'minimax',source:'micu',vision:id==='MiniMax-M3',visionUnknown:false,gameDrawing:true,imageGeneration:false,
  inputPrice:null,outputPrice:null,reasoning:null,supportedParameters:[],reference:'https://www.micuapi.ai'
}));
