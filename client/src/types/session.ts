// client/src/types/session.ts
// New Session-based Architecture Types

export type UserRole = 'faculty' | 'learner' | 'stage'

export interface UserProfile {
  id: string
  name: string
  email: string
  role: UserRole
  avatar?: string
  createdAt: number
  lastActive: number
  preferences: {
    notifications: boolean
    theme: 'light' | 'dark'
  }
  stats: {
    sessionsCompleted: number
    casesCompleted: number
    totalTime: number // in minutes
  }
}

export interface Session {
  id: string
  name: string
  description?: string
  caseId: string
  createdBy: string // faculty user id
  createdAt: number
  startedAt?: number
  endedAt?: number
  status: 'lobby' | 'active' | 'paused' | 'completed'
  
  // Participants
  faculty: SessionParticipant[]
  learners: SessionParticipant[]
  stage?: SessionParticipant // optional stage operator
  
  // Session settings
  settings: {
    maxLearners: number
    allowLateJoin: boolean
    recordSession: boolean
    publicJoin: boolean // or invite-only
  }
  
  // Runtime state
  currentStage: StageState
  timeline: SessionEvent[]
  
  // Post-session
  debrief?: SessionDebrief
}

export interface SessionParticipant {
  userId: string
  userProfile: UserProfile
  joinedAt: number
  leftAt?: number
  isActive: boolean
  permissions: string[] // specific permissions in this session
  
  // Learner-specific
  assignedRole?: string // 'Team Lead', 'Airway', etc.
  color?: string
}

export interface StageState {
  items: StageItem[]
  minimized: StageItem[]
  history: StageEvent[]
}

export interface StageItem {
  assetId: string
  displayedAt: number
  minimizedAt?: number
}

export interface StageEvent {
  type: 'show' | 'hide' | 'clear' | 'minimize' | 'restore'
  assetId?: string
  timestamp: number
  triggeredBy: string // userId
}

export interface SessionEvent {
  id: string
  type: 'session-start' | 'session-pause' | 'session-resume' | 'session-end' |
        'user-join' | 'user-leave' | 'stage-update' | 'order' | 'request' | 
        'question' | 'pearl' | 'case-change'
  timestamp: number
  userId: string
  data: any
  metadata?: {
    userRole: UserRole
    userName: string
    userColor?: string
  }
}

export interface SessionDebrief {
  completedAt: number
  completedBy: string
  duration: number // in minutes
  
  // Learning objectives & outcomes
  objectives: {
    id: string
    text: string
    achieved: boolean
    notes?: string
  }[]
  
  // Performance metrics
  metrics: {
    orderAccuracy: number // 0-100
    timeToDecision: number // average seconds
    teamworkScore: number // 0-100
    communicationScore: number // 0-100
  }
  
  // Feedback
  instructorNotes: string
  learnerReflections: {
    userId: string
    reflection: string
    rating: number // 1-5
  }[]
  
  // Session artifacts
  timeline: SessionEvent[]
  finalStage: StageState
  orders: Order[]
  assets: Asset[]
}

// Lobby types
export interface LobbyState {
  activeSessions: Session[]
  availableCases: Case[]
  onlineUsers: UserProfile[]
  invitations: SessionInvitation[]
}

export interface SessionInvitation {
  id: string
  sessionId: string
  fromUserId: string
  toUserId: string
  createdAt: number
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  message?: string
}

// Legacy types (still needed for migration)
export interface Case {
  id: string
  title: string
  description?: string
  summary?: string
  assets: Asset[]
  vitals?: Vital[]
  gates?: Gate[]
  createdAt: number
  updatedAt: number
}

export interface Asset {
  id: string
  title: string
  type: 'lab' | 'image' | 'pdf' | 'video' | 'note'
  content?: string
  contentUrl?: string
}

export interface Order {
  code: string
  name: string
  kind: 'lab' | 'imaging' | 'med' | 'other'
  orderedAt: number
  orderedBy: string
}

export interface Vital {
  t: number
  hr?: number
  bp?: string
  rr?: number
  spo2?: number
  temp?: number
}

export interface Gate {
  id: string
  label: string
  when: { type: 'time'; msFromStart: number }
  reveals: string[]
  orderCode?: string
}

// WebSocket Event Types
export interface SessionSocketEvents {
  // Client -> Server
  'lobby:join': { userId: string }
  'lobby:leave': { userId: string }
  'session:create': { sessionData: Partial<Session> }
  'session:join': { sessionId: string; userId: string }
  'session:leave': { sessionId: string; userId: string }
  'session:invite': { sessionId: string; userIds: string[]; message?: string }
  'session:start': { sessionId: string }
  'session:pause': { sessionId: string }
  'session:resume': { sessionId: string }
  'session:end': { sessionId: string }
  
  // Server -> Client
  'lobby:state': LobbyState
  'session:created': { session: Session }
  'session:updated': { session: Session }
  'session:user-joined': { sessionId: string; participant: SessionParticipant }
  'session:user-left': { sessionId: string; userId: string }
  'session:invitation': { invitation: SessionInvitation }
  'session:started': { sessionId: string; startedAt: number }
  'session:ended': { sessionId: string; endedAt: number }
}