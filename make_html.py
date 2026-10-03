import urllib.parse
html = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body {
    background: #f0f0f0;
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>
</head>
<body class="flex items-center justify-center h-screen bg-gray-100">

<!-- Widget Simulation -->
<div class="relative w-[400px] h-[640px] rounded-2xl overflow-hidden shadow-2xl border border-amber-300/40 flex flex-col" style="background: linear-gradient(160deg, #1a0938 0%, #2d0a5b 45%, #3b0764 100%)">
  
  <!-- Header -->
  <div class="p-5 pt-6 flex-shrink-0">
    <div class="flex items-center gap-3 mb-4">
      <div class="h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg" style="background: linear-gradient(135deg, #FFD700, #DAA520)">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6 text-purple-950"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
      </div>
      <div>
        <h2 class="text-[17px] font-semibold text-amber-50">Smit AI Sahayak</h2>
        <p class="text-[13px] text-amber-200/70 mt-0.5">Online • Always here to help</p>
      </div>
    </div>
  </div>

  <!-- Messages -->
  <div class="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
    <!-- User msg -->
    <div class="flex min-w-0 max-w-[88%] text-[13px] leading-relaxed rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap select-text break-words [overflow-wrap:anywhere] self-end bg-gradient-to-br from-purple-700 to-purple-900 text-amber-100 border border-amber-300/20 rounded-br-sm">
      Where can I join the WhatsApp group?
    </div>
    
    <!-- AI msg -->
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="min-w-0">
        <div class="flex min-w-0 max-w-[88%] text-[13px] leading-relaxed rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap select-text break-words [overflow-wrap:anywhere] self-start bg-white/6 text-amber-100/90 border border-amber-300/10 rounded-bl-sm">
          <span>અહીં ક્લિક કરો: </span>
          <span>
            <a href="https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-amber-200 break-all text-amber-200">https://chat.whatsapp.com/CS5vmo9R3yXKxlvBHP0EYh</a>
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Input -->
  <div class="flex-shrink-0 flex gap-2 items-center p-3 border-t border-amber-300/15 bg-black/20">
    <input type="text" placeholder="ગુજરાતીમાં લખો..." class="flex-1 px-3.5 py-2.5 rounded-xl bg-white/6 border border-amber-300/20 text-amber-100 placeholder-amber-200/60 text-[13px] outline-none focus:border-amber-400/50 transition-colors" />
    <button class="flex items-center justify-center p-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-purple-950 transition-all shadow-md">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
    </button>
  </div>
</div>

</body>
</html>
"""
with open("widget-preview.html", "w", encoding="utf-8") as f:
    f.write(html)
