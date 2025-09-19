// client/src/contexts/SessionContext.tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { SessionService } from '../services/sessionService'
import { UserService } from '../services/userService'
import { Session, UserProfile } from '../types/session'

interface SessionContextType {
  // Current session state
  currentSession: Session | null
  currentUser: UserProfile | null
  isConnected: boolean
  
  // Session management
  joinSession: (sessionId: string) => Promise<void>
  leaveSession: () => void
  startSession: () => Promise<void>
  pauseSession: () => Promise<void>
  resumeSession: () => Promise<void>
  endSession: () => Promise<void>
  
  // User management
  getCurrentUserRole: () => 'faculty' | 'learner' | 'stage' | null
  isUserFaculty: () => boolean
  canControlSession: () => boolean
  
  // Error handling
  error: string | null
  clearError: () => void
}

const SessionContext = createContext<SessionContextType | null>(null)

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}

interface SessionProviderProps {
  children: React.ReactNode
}

export function SessionProvider({ children }: SessionProviderProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionService = SessionService.getInstance()
  const userService = UserService.getInstance()

  // State
  const [currentSession, setCurrentSession] = useState<Session | null>(null)
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize on mount
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // Get current user (optional for control access)
        const user = userService.getCurrentUser()
        setCurrentUser(user)

        // Check for session parameter
        const sessionId = searchParams.get('session')
        if (sessionId) {
          await joinSession(sessionId)
        }
        // Allow entering control without a session - let SessionControl handle it

        setIsConnected(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize session')
      }
    }

    initializeSession()
  }, [searchParams])

  // Session event listeners
  useEffect(() => {
    const handleSessionUpdated = (session: Session) => {
      if (currentSession?.id === session.id) {
        setCurrentSession(session)
      }
    }

    const handleUserJoined = ({ sessionId, participant }: any) => {
      if (currentSession?.id === sessionId) {
        // Update session with new participant
        setCurrentSession(prev => {
          if (!prev) return prev
          const updated = { ...prev }
          if (participant.userProfile.role === 'faculty') {
            updated.faculty = [...updated.faculty, participant]
          } else if (participant.userProfile.role === 'stage') {
            updated.stage = participant
          } else {
            updated.learners = [...updated.learners, participant]
          }
          return updated
        })
      }
    }

    const handleUserLeft = ({ sessionId, userId }: any) => {
      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => {
          if (!prev) return prev
          return {
            ...prev,
            faculty: prev.faculty.filter(f => f.userId !== userId),
            learners: prev.learners.filter(l => l.userId !== userId),
            stage: prev.stage?.userId === userId ? undefined : prev.stage
          }
        })
      }
    }

    const handleSessionStarted = ({ sessionId }: any) => {
      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => prev ? { ...prev, status: 'active', startedAt: Date.now() } : prev)
      }
    }

    const handleSessionEnded = ({ sessionId }: any) => {
      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => prev ? { ...prev, status: 'completed', endedAt: Date.now() } : prev)
      }
    }

    sessionService.on('sessionUpdated', handleSessionUpdated)
    sessionService.on('userJoined', handleUserJoined)
    sessionService.on('userLeft', handleUserLeft)
    sessionService.on('sessionStarted', handleSessionStarted)
    sessionService.on('sessionEnded', handleSessionEnded)

    return () => {
      sessionService.off('sessionUpdated', handleSessionUpdated)
      sessionService.off('userJoined', handleUserJoined)
      sessionService.off('userLeft', handleUserLeft)
      sessionService.off('sessionStarted', handleSessionStarted)
      sessionService.off('sessionEnded', handleSessionEnded)
    }
  }, [currentSession])

  // Session management functions
  const joinSession = useCallback(async (sessionId: string) => {
    try {
      setError(null)
      await sessionService.joinSession(sessionId)
      const session = sessionService.getCurrentSession()
      setCurrentSession(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join session')
      throw err
    }
  }, [])

  const leaveSession = useCallback(() => {
    sessionService.leaveSession()
    setCurrentSession(null)
    navigate('/')
  }, [navigate])

  const startSession = useCallback(async () => {
    if (!currentSession) return
    try {
      setError(null)
      await sessionService.startSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
      throw err
    }
  }, [currentSession])

  const pauseSession = useCallback(async () => {
    if (!currentSession) return
    try {
      setError(null)
      await sessionService.pauseSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause session')
      throw err
    }
  }, [currentSession])

  const resumeSession = useCallback(async () => {
    if (!currentSession) return
    try {
      setError(null)
      await sessionService.resumeSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume session')
      throw err
    }
  }, [currentSession])

  const endSession = useCallback(async () => {
    if (!currentSession) return
    try {
      setError(null)
      await sessionService.endSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end session')
      throw err
    }
  }, [currentSession])

  // Helper functions
  const getCurrentUserRole = useCallback(() => {
    return currentUser?.role || null
  }, [currentUser])

  const isUserFaculty = useCallback(() => {
    return currentUser?.role === 'faculty'
  }, [currentUser])

  const canControlSession = useCallback(() => {
    if (!currentUser || !currentSession) return false
    
    // Check if user is faculty in this session
    return currentSession.faculty.some(f => f.userId === currentUser.id) ||
           currentSession.createdBy === currentUser.id
  }, [currentUser, currentSession])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const contextValue: SessionContextType = {
    currentSession,
    currentUser,
    isConnected,
    joinSession,
    leaveSession,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    getCurrentUserRole,
    isUserFaculty,
    canControlSession,
    error,
    clearError
  }

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  )
}