// client/src/services/sessionService.ts
import { socket } from '../socket'
import { 
  Session, 
  SessionParticipant, 
  SessionInvitation, 
  LobbyState,
  SessionSocketEvents,
  UserProfile
} from '../types/session'
import { UserService } from './userService'

export class SessionService {
  private static instance: SessionService
  private currentSession: Session | null = null
  private lobbyState: LobbyState | null = null
  private listeners: Map<string, Function[]> = new Map()

  static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService()
    }
    return SessionService.instance
  }

  constructor() {
    this.initializeSocketListeners()
  }

  // Initialize WebSocket event listeners
  private initializeSocketListeners(): void {
    socket.on('lobby:state', (state: LobbyState) => {
      this.lobbyState = state
      this.emit('lobbyUpdated', state)
    })

    socket.on('session:created', ({ session }) => {
      this.emit('sessionCreated', session)
    })

    socket.on('session:updated', ({ session }) => {
      if (this.currentSession?.id === session.id) {
        this.currentSession = session
      }
      this.emit('sessionUpdated', session)
    })

    socket.on('session:user-joined', ({ sessionId, participant }) => {
      if (this.currentSession?.id === sessionId) {
        this.currentSession.learners.push(participant)
      }
      this.emit('userJoined', { sessionId, participant })
    })

    socket.on('session:user-left', ({ sessionId, userId }) => {
      if (this.currentSession?.id === sessionId) {
        this.currentSession.learners = this.currentSession.learners.filter(
          p => p.userId !== userId
        )
        this.currentSession.faculty = this.currentSession.faculty.filter(
          p => p.userId !== userId
        )
      }
      this.emit('userLeft', { sessionId, userId })
    })

    socket.on('session:invitation', ({ invitation }) => {
      this.emit('invitationReceived', invitation)
    })

    socket.on('session:started', ({ sessionId, startedAt }) => {
      if (this.currentSession?.id === sessionId) {
        this.currentSession.startedAt = startedAt
        this.currentSession.status = 'active'
      }
      this.emit('sessionStarted', { sessionId, startedAt })
    })

    socket.on('session:ended', ({ sessionId, endedAt }) => {
      if (this.currentSession?.id === sessionId) {
        this.currentSession.endedAt = endedAt
        this.currentSession.status = 'completed'
      }
      this.emit('sessionEnded', { sessionId, endedAt })
    })
  }

  // Event listener management
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach(callback => callback(data))
    }
  }

  // Lobby operations
  async joinLobby(): Promise<void> {
    const user = UserService.getInstance().getCurrentUser()
    if (!user) {
      throw new Error('Must be logged in to join lobby')
    }

    socket.emit('lobby:join', { userId: user.id })
  }

  leaveLobby(): void {
    const user = UserService.getInstance().getCurrentUser()
    if (user) {
      socket.emit('lobby:leave', { userId: user.id })
    }
  }

  getLobbyState(): LobbyState | null {
    return this.lobbyState
  }

  // Session operations
  async createSession(sessionData: {
    name: string
    description?: string
    caseId: string
    maxLearners?: number
    allowLateJoin?: boolean
    publicJoin?: boolean
  }): Promise<Session> {
    const user = UserService.getInstance().getCurrentUser()
    if (!user || user.role !== 'faculty') {
      throw new Error('Only faculty can create sessions')
    }

    const session: Partial<Session> = {
      name: sessionData.name,
      description: sessionData.description,
      caseId: sessionData.caseId,
      createdBy: user.id,
      status: 'lobby',
      faculty: [{
        userId: user.id,
        userProfile: user,
        joinedAt: Date.now(),
        isActive: true,
        permissions: ['admin', 'control', 'invite']
      }],
      learners: [],
      settings: {
        maxLearners: sessionData.maxLearners || 8,
        allowLateJoin: sessionData.allowLateJoin ?? true,
        recordSession: true,
        publicJoin: sessionData.publicJoin ?? false
      },
      currentStage: {
        items: [],
        minimized: [],
        history: []
      },
      timeline: []
    }

    return new Promise((resolve, reject) => {
      const onCreated = (createdSession: Session) => {
        this.currentSession = createdSession
        this.off('sessionCreated', onCreated)
        resolve(createdSession)
      }

      this.on('sessionCreated', onCreated)
      socket.emit('session:create', { sessionData: session })

      // Timeout after 10 seconds
      setTimeout(() => {
        this.off('sessionCreated', onCreated)
        reject(new Error('Session creation timeout'))
      }, 10000)
    })
  }

  async joinSession(sessionId: string): Promise<void> {
    const user = UserService.getInstance().getCurrentUser()
    if (!user) {
      throw new Error('Must be logged in to join session')
    }

    socket.emit('session:join', { sessionId, userId: user.id })
    
    // Load session details
    try {
      const session = await this.loadSession(sessionId)
      this.currentSession = session
    } catch (error) {
      console.warn('Failed to load session details:', error)
    }
  }

  leaveSession(): void {
    if (!this.currentSession) return

    const user = UserService.getInstance().getCurrentUser()
    if (user) {
      socket.emit('session:leave', { 
        sessionId: this.currentSession.id, 
        userId: user.id 
      })
    }
    this.currentSession = null
  }

  getCurrentSession(): Session | null {
    return this.currentSession
  }

  // Session control (faculty only)
  async startSession(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    const user = UserService.getInstance().getCurrentUser()
    if (!user || user.role !== 'faculty') {
      throw new Error('Only faculty can start sessions')
    }

    socket.emit('session:start', { sessionId: this.currentSession.id })
  }

  async pauseSession(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    socket.emit('session:pause', { sessionId: this.currentSession.id })
  }

  async resumeSession(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    socket.emit('session:resume', { sessionId: this.currentSession.id })
  }

  async endSession(): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    socket.emit('session:end', { sessionId: this.currentSession.id })
  }

  // Invitations
  async inviteUsers(userIds: string[], message?: string): Promise<void> {
    if (!this.currentSession) {
      throw new Error('No active session')
    }

    socket.emit('session:invite', {
      sessionId: this.currentSession.id,
      userIds,
      message
    })
  }

  async respondToInvitation(invitationId: string, accept: boolean): Promise<void> {
    const response = await fetch(`/api/invitations/${invitationId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept })
    })

    if (!response.ok) {
      throw new Error('Failed to respond to invitation')
    }

    if (accept) {
      const invitation = await response.json()
      await this.joinSession(invitation.sessionId)
    }
  }

  // Data persistence
  private async loadSession(sessionId: string): Promise<Session> {
    const response = await fetch(`/api/sessions/${sessionId}`)
    if (!response.ok) {
      throw new Error('Failed to load session')
    }
    return await response.json()
  }

  async saveSession(): Promise<void> {
    if (!this.currentSession) return

    const response = await fetch(`/api/sessions/${this.currentSession.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.currentSession)
    })

    if (!response.ok) {
      throw new Error('Failed to save session')
    }
  }

  // Get user's session history
  async getUserSessions(userId?: string): Promise<Session[]> {
    const targetUserId = userId || UserService.getInstance().getCurrentUser()?.id
    if (!targetUserId) return []

    try {
      const response = await fetch(`/api/users/${targetUserId}/sessions`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.warn('Failed to load user sessions:', error)
    }
    return []
  }
}