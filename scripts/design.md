# Prompt Forge – Functional Requirements (FRD)

## 1. Purpose
Prompt Forge is a **prompt-debugging tool** that can simultaneously send a single prompt to **N large-language models (LLMs)** — OpenAI, Claude, Google (Gemini), Ollama, *etc.* — and present their responses in a unified timeline for rapid comparison and iteration.

---

## 2. Supported Use-Cases
| ID | Use-Case | Description |
|----|----------|-------------|
| UC-01 | **Text Prompt Debugging** | User submits text, receives multiple model outputs side-by-side, can copy or retry any result. |
| UC-02 | **Image Prompt Debugging** | User submits an image-generation prompt; receives, previews, and downloads images from multiple models. |
| UC-03 | **Model Comparison** | User toggles which LLMs run (default **OpenAI**); results stream into the timeline. |
| UC-04 | **Result Filtering** | User filters timeline items by date, status, model, and provider. |
| UC-05 | **Local Persistence** | All prompts, results, filters, and UI state persist in browser storage for offline recall. |

---

## 3. Functional Requirements

### 3.1 Prompt Submission
- **F-1.1** Support **text** and **image** modes; mode switch is explicit.  
- **F-1.2** Allow selection of one or more LLM providers; default = OpenAI.  
- **F-1.3** Provide model-specific options (size, quality, *etc.*) via adaptive forms validated by **React Hook Form + zod**.

### 3.2 Timeline Interface
- **F-2.1** Single scrollable timeline component with **infinite loading & cursor-based pagination**.  
- **F-2.2** Responsive masonry grid: **1 col mobile / 2 cols tablet / 4 cols desktop**.  
- **F-2.3** Minimal filter bar (date, status, model, provider) with live combinable filters.

### 3.3 Text Result Cards
- **F-3.1** Show user prompt + each model’s response.  
- **F-3.2** Provide **Copy** button for both prompt and response.  
- **F-3.3** Provide **Quick Retry** button to resubmit the prompt to the same model set.

### 3.4 Image Result Cards
- **F-4.1** Display thumbnail grid; **click any image → downloads file**.  
- **F-4.2** “Details” modal contains: all generated images, `jobId`, creation time (ISO 8601), status, image count, dimensions, model, quality.

### 3.5 LLM Adapter Layer
- **F-5.1** Abstract provider-specific API schemas into a **unified request/response interface**.  
- **F-5.2** Handle provider auth keys (entered once, stored locally, never sent to backend).  
- **F-5.3** Normalize statuses (queued, running, succeeded, failed, cancelled).

### 3.6 Persistence
- **F-6.1** Use **IndexedDB via Dexie.js** _(or similar)_ for structured local storage.  
- **F-6.2** Store prompts, results, filters, and user preferences; autosave on change.  
- **F-6.3** Provide “Clear Data” action that wipes local storage after confirmation.

---

## 4. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | First contentful paint < 1.5 s on a mid-range mobile device; timeline lazy-loads images and text. |
| **Accessibility** | WCAG 2.2 AA compliance; keyboard-navigable timeline and modals. |
| **UX / Aesthetics** | Clean, modern visual language using **TailwindCSS** + **Shadcn UI** + **Lucide Icons**; subtle motion (Framer Motion) but no visual clutter. |
| **Offline** | Core reading & filtering work fully offline once assets are cached. |
| **Security** | No server-side storage; API keys encrypted at-rest in browser; |

---

## 5. Tech Stack Constraints
- **Frontend Framework**: Next.js 15 (App Router, React Server Components).  
- **Styling**: TailwindCSS with shadcn/ui primitives.  
- **State/Persistence**: React Context + Zustand (UI) and IndexedDB (data).  
- **Icons**: Lucide Icons.  
- **Validation**: React Hook Form + zod.  
- **Build Target**: 100 × Lighthouse PWA score.

---

## 6. Out of Scope
- Multi-user accounts or cloud sync.  
- Server-side databases or authentication flows beyond local API-key storage.  
- Advanced analytics or usage metering.

---

## 7. Glossary
| Term | Meaning |
|------|---------|
| **LLM** | Large-language model (OpenAI GPT-4o, Claude 3, Gemini 1.5, Ollama Llama-3, *etc.*). |
| **Prompt** | Text or image generation instruction sent to an LLM. |
| **Timeline Item** | A single prompt-response set from one provider rendered in the UI. |