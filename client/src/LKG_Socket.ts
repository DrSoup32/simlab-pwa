// client/src/socket.ts
import { io, Socket } from "socket.io-client";

export type AssetType = "note" | "lab" | "image" | "pdf" | "video" | "poll";
export type Asset = {
  id: string;
  title: string;
  type: AssetType;
  content?: string;
  contentUrl?: string;
};

export type Poll = {
  id: string;
  caseId?: string;
  question: string;
  options: string[];
  counts: number[];
  total: number;
  closed?: boolean;
  multi?: boolean;
  anonymous?: boolean;
  closesAt?: number | null;
};
export type Order = { code: string; by: string; at: number };
export type StageShowPayload = { asset: Asset; at: number; caseId?: string };
export type Pearl = {
  id: string;
  text: string;
  tag?: string;
  at: number;
  by?: string;
  caseId?: string;
  linkedAssetId?: string;
  hidden?: boolean;
};
export type LearnerBrief = { id: string; name: string; color?: string };

// Server -> Client
export type ServerToClientEvents = {
  "control:order": (
    o: Order & { learnerId?: string; color?: string; role?: string },
  ) => void;
  "control:request": (r: {
    kind: string;
    detail?: string;
    by: string;
    at: number;
    learnerId?: string;
    color?: string;
  }) => void;
  "control:question": (q: {
    text: string;
    by: string;
    at: number;
    learnerId?: string;
    color?: string;
  }) => void;

  "learner:message": (m: { text: string; at: number }) => void;

  "stage:show": (payload: StageShowPayload) => void;
  "stage:clear": () => void;
  "stage:reset": (payload: { caseId?: string }) => void;
  "stage:announce": (payload: { text: string; at: number; caseId?: string }) => void;
  "stage:poll:update": (p: Poll) => void;
  "stage:poll:closed": (p: { id: string; caseId?: string }) => void;
  "learner:poll:ack": (p: {
    id: string;
    caseId?: string;
    success: boolean;
    reason?: string;
    counts?: number[];
    total?: number;
  }) => void;
  "control:stage:minimized": (payload: {
    item: StageShowPayload;
    caseId?: string;
  }) => void;
  "control:stage:restored": (payload: {
    item: StageShowPayload;
    caseId?: string;
  }) => void;
  "control:stage:reset"?: (payload: { caseId?: string }) => void;
  "control:stage:message"?: (payload: { text: string; at: number; caseId?: string; by?: string }) => void;
  "control:case:started": (payload: {
    caseId: string;
    startedAt: number;
  }) => void;
  "control:case:paused": (payload: {
    caseId: string;
    pausedAt: number;
  }) => void;
  "control:case:resumed": (payload: {
    caseId: string;
    resumedAt: number;
  }) => void;
  "control:case:stopped": (payload: {
    caseId: string;
    stoppedAt: number;
  }) => void;

  "control:pearl": (p: Pearl) => void;
  "control:pearlUpdated": (p: Pearl) => void;
  "control:pearlHidden": (payload: { id: string }) => void;

  "control:learner:list": (payload: { caseId?: string; learners: LearnerBrief[] }) => void;
  "control:learner:joined": (payload: { caseId?: string } & LearnerBrief) => void;
  "control:learner:left": (payload: { caseId?: string; id: string }) => void;
  "learner:welcome": (me: { id: string; color?: string }) => void;
  'learner:orders:catalog': (p: {
    caseId?: string
    catalog: Array<{ code:string; name:string; kind:'lab'|'imaging'|'med'|'other' }>
    index?: Record<string, { kind:string; category:string; group:string; label:string }>
  policy?: Record<string, 'ok'|'justify'|'blocked'>
  roles?: Record<string, string[]>
  }) => void

  "control:reflection": (p: {
    by: string;
    role?: string;
    learnerId?: string;
    caseId?: string;
    at: number;
    good?: string;
    bad?: string;
    improve?: string;
  }) => void;

  "learner:poll": (p: {
    id: string;
    caseId?: string;
    question: string;
    options: string[];
    multi?: boolean;
    anonymous?: boolean;
    closesAt?: number | null;
  }) => void;

  "control:poll:update": (p: Poll) => void;

  "control:poll:closed": (p: { id: string; caseId?: string }) => void;

  labResult: (msg: string) => void;
  pong?: () => void;
};

// Client -> Server
export type ClientToServerEvents = {
  "control:hello": (payload: { caseId: string }) => void;
  "learner:hello": (payload: {
    id?: string;
    name: string;
    caseId?: string;
  }) => void;

  "learner:order": (payload: {
    code: string;
    by: string;
    learnerId?: string;
    caseId?: string;
    role?: string;
  }) => void;
  "learner:request": (payload: {
    kind: string;
    detail?: string;
    by: string;
    learnerId?: string;
    at?: number;
    caseId?: string;
    role?: string;
  }) => void;
  "learner:question": (payload: {
    text: string;
    by: string;
    learnerId?: string;
    at?: number;
    caseId?: string;
    role?: string;
  }) => void;
  "learner:reflection": (p: {
    by: string;
    role?: string;
    learnerId?: string;
    caseId?: string;
    at?: number;
    good?: string;
    bad?: string;
    improve?: string;
  }) => void;
  "control:orders:setCatalog": (p: {
    caseId?: string;
    catalog: Array<{
      code: string;
      name: string;
      kind: "lab" | "imaging" | "med" | "other";
    }>;
    index?: Record<string, { kind: string; category: string; group: string; label: string }>;
    policy?: Record<string, "ok" | "justify" | "blocked">;
  roles?: Record<string, string[]>;
  }) => void;

  "control:drop": (payload: StageShowPayload) => void;
  "control:stage:clear": (payload?: { caseId?: string }) => void;
  "control:stage:reset": (payload?: { caseId?: string }) => void;
  "control:stage:broadcast": (payload: { caseId?: string; text?: string; asset?: Asset }) => void;
  "control:scheduleDrop": (payload: {
    key: string;
    asset: Asset;
    when: number;
    caseId?: string;
  }) => void;
  "control:cancelScheduled": (payload: { key: string }) => void;
  "control:message": (payload: {
    text: string;
    at?: number;
    caseId?: string;
    targetId?: string;
  }) => void;
  "control:case:start": (payload: { caseId: string }) => void;
  "control:case:pause": (payload: { caseId: string }) => void;
  "control:case:resume": (payload: { caseId: string }) => void;
  "control:case:stop": (payload: { caseId: string }) => void;
  "control:pearl": (payload: Pearl) => void;
  "control:pearlHide": (payload: { id: string; caseId?: string }) => void;

  "stage:minimize": (payload: {
    item: StageShowPayload;
    caseId?: string;
  }) => void;
  "stage:restore": (payload: {
    item: StageShowPayload;
    caseId?: string;
  }) => void;
  "stage:message": (payload: { text: string; at?: number; caseId?: string }) => void;

  "control:poll:create": (p: {
    id: string;
    caseId?: string;
    question: string;
    options: string[];
    multi?: boolean;
    anonymous?: boolean;
    durationSec?: number; // optional auto-close
  }) => void;

  "control:poll:close": (p: { id: string; caseId?: string }) => void;

  "learner:poll:vote": (p: {
    pollId: string;
    caseId?: string;
    choiceIndexes: number[]; // e.g., [1] or [0,2] if multi
    by: string;
    role?: string;
    learnerId?: string;
  }) => void;

  sendLab: (msg: string) => void;
  ping: () => void;
};

// Singleton socket
let _socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
export function getSocket(): Socket<
  ServerToClientEvents,
  ClientToServerEvents
> {
  if (!_socket) _socket = io("/", { transports: ["websocket"] });
  return _socket;
}
export const socket = getSocket();
