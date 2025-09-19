import { io, Socket } from "socket.io-client";

/** ---------- Core shared types ---------- */
export type AssetType = "note" | "lab" | "image" | "pdf" | "video" | "poll";

export type Asset = {
  id: string;
  title: string;
  type: AssetType;
  /** note/lab text */
  content?: string;
  /** image/video/pdf url */
  contentUrl?: string;
  /** optional structured lab block */
  lab?: {
    values: Record<string, string>;
    units?: Record<string, string>;
    ranges?: Record<string, string>;
  };
} & Record<string, any>;

export type Order = {
  code: string;
  name: string;
  kind: "lab" | "imaging" | "med" | "other";
};

export type Pearl = { text: string; at: number; color?: string };

type StageItem = { asset: Asset; at?: number; orderAt?: number };

/** ---------- Event maps (loose payloads for compile compatibility) ---------- */
export interface ServerToClientEvents {
  // Stage lifecycle pushes
  "stage:show": (payload: StageItem | Asset) => void;
  "stage:clear": () => void;
  "stage:reset": () => void;
  "stage:announce": (msg: { text: string; at: number }) => void;

  // Control → Stage focus
  "control:stage:select": (payload: {
    caseId?: string;
    assetId?: string;
    at?: number;
    index?: number;
  }) => void;

  // Control → Stage misc
  "control:stage:minimized": (payload: { item: StageItem; caseId?: string }) => void;
  "control:stage:restored": (payload: { item: StageItem; caseId?: string }) => void;
  "control:stage:message": (payload: { text: string; at: number; caseId?: string }) => void;

  // Control session signals
  "control:case:started": (p: any) => void;
  "control:case:paused": (p: any) => void;
  "control:case:resumed": (p: any) => void;
  "control:case:stopped": (p: any) => void;
  // (Optional) echo of pause/resume if learners need to react could be added here later

  // Control ← learner presence
  // Presence (uniform shape everywhere)
  "control:learner:list": (payload: { caseId?: string; learners: Array<{ id: string; name: string; color?: string }> }) => void;
  "control:learner:joined": (payload: { caseId?: string; id: string; name: string; color?: string }) => void;
  "control:learner:left": (payload: { caseId?: string; id: string }) => void;

  // Teaching streams to Control
  "control:order": (payload: any) => void;
  "control:request": (payload: any) => void;
  "control:question": (payload: any) => void;
  "control:reflection": (payload: any) => void;

  // Pearls to Control
  "control:pearl": (payload: any) => void;
  "control:pearlUpdated": (payload: any) => void;
  "control:pearlHidden": (payload: any) => void;

  // Polls to Control & Learner
  "control:poll:update": (payload: any) => void;
  "control:poll:closed": (payload: any) => void;

  // Session & Lobby events (NEW)
  "lobby:state": (payload: any) => void;
  "session:created": (payload: { session: any }) => void;
  "session:updated": (payload: { session: any }) => void;
  "session:user-joined": (payload: { sessionId: string; participant: any }) => void;
  "session:user-left": (payload: { sessionId: string; userId: string }) => void;
  "session:invitation": (payload: { invitation: any }) => void;
  "session:started": (payload: { sessionId: string; startedAt: number }) => void;
  "session:ended": (payload: { sessionId: string; endedAt: number }) => void;

  // Learner-targeted pushes
  "learner:welcome": (payload: any) => void;
  "learner:orders:catalog": (payload: any) => void;
  "learner:poll": (payload: any) => void;
  "learner:message": (payload: any) => void;
}

export interface ClientToServerEvents {
  // Control presence & session
  "control:hello": (payload: { caseId?: string }) => void;
  "control:case:start": (payload: { caseId?: string }) => void;
  // Add explicit pause/resume controls used in Control.tsx
  "control:case:pause": (payload: { caseId?: string }) => void;
  "control:case:resume": (payload: { caseId?: string }) => void;
  "control:case:stop": (payload: { caseId?: string }) => void;

  // Control authoring/teaching
  "control:orders:setCatalog": (payload: any) => void;
  "control:pearl": (payload: any) => void;
  "control:pearlHide": (payload: any) => void;
  "control:poll:create": (payload: any) => void;
  "control:poll:close": (payload: any) => void;

  // Control asset flow
  "control:drop": (payload: any) => void;
  "control:scheduleDrop": (payload: any) => void;
  // Broadcast stage text (legacy may have sent full StageItem; allow either)
  "control:stage:broadcast": (payload: StageItem | { text: string; at?: number; caseId?: string }) => void;
  "control:stage:clear": (payload: { caseId?: string }) => void;
  "control:stage:reset": (payload: { caseId?: string }) => void;
  // Broadcast a text-only message to stage viewers (Control uses caseId + text)
  // same signature as above for server responses not needed here (client->server already declared)

  // NEW: Control focuses Stage
  "control:stage:select": (payload: {
    caseId?: string;
    assetId?: string;
    at?: number;
    index?: number;
  }) => void;

  // Chat
  // Optional targetId (learner specific) supported by Control UI
  "control:message": (payload: { text: string; at: number; caseId?: string; targetId?: string }) => void;
  "stage:message": (payload: { text: string; at: number; caseId?: string }) => void;

  // Session & Lobby events (NEW)
  "lobby:join": (payload: { userId: string }) => void;
  "lobby:leave": (payload: { userId: string }) => void;
  "session:create": (payload: { sessionData: any }) => void;
  "session:join": (payload: { sessionId: string; userId: string }) => void;
  "session:leave": (payload: { sessionId: string; userId: string }) => void;
  "session:invite": (payload: { sessionId: string; userIds: string[]; message?: string }) => void;
  "session:start": (payload: { sessionId: string }) => void;
  "session:pause": (payload: { sessionId: string }) => void;
  "session:resume": (payload: { sessionId: string }) => void;
  "session:end": (payload: { sessionId: string }) => void;

  // Learner actions
  "learner:hello": (payload: { caseId?: string; name?: string; id?: string }) => void;
  "learner:order": (payload: any) => void;
  "learner:request": (payload: any) => void;
  "learner:question": (payload: any) => void;
  "learner:reflection": (payload: any) => void;
  "learner:poll:vote": (payload: { caseId?: string; pollId: string; choiceId: string }) => void;
}

/** ---------- Singleton socket ---------- */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io("", {
  path: "/socket.io",
  transports: ["websocket"],
});
socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
});