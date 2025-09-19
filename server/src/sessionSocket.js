// server/src/sessionSocket.js
import { loadSession, saveSession, loadInvitations, saveInvitations } from './sessionStorage.js'

// In-memory lobby state
let lobbyState = {
  activeSessions: [],
  availableCases: [],
  onlineUsers: [],
  invitations: []
}

// Refresh lobby state from disk
function refreshLobbyState() {
  try {
    // Load sessions from sessionRoutes helper (we'll need to export those functions)
    // For now, we'll implement a simple version
    lobbyState.activeSessions = [] // Will be populated by actual session loading
    lobbyState.invitations = loadInvitations() || []
  } catch (e) {
    console.error('Failed to refresh lobby state:', e)
  }
}

export function registerSessionSocket(io) {
  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id)

    // Lobby events
    socket.on('lobby:join', ({ userId }) => {
      console.log('User joined lobby:', userId)
      socket.userId = userId
      socket.join('lobby')
      
      // Add user to online users
      const existingIndex = lobbyState.onlineUsers.findIndex(u => u.id === userId)
      if (existingIndex >= 0) {
        lobbyState.onlineUsers[existingIndex].lastActive = Date.now()
      } else {
        // In a real implementation, we'd load the full user profile
        lobbyState.onlineUsers.push({
          id: userId,
          name: `User ${userId}`, // Placeholder
          role: 'learner', // Placeholder
          lastActive: Date.now()
        })
      }
      
      // Send current lobby state
      socket.emit('lobby:state', lobbyState)
      
      // Broadcast user joined to other lobby users
      socket.to('lobby').emit('lobby:state', lobbyState)
    })

    socket.on('lobby:leave', ({ userId }) => {
      console.log('User left lobby:', userId)
      socket.leave('lobby')
      
      // Remove from online users
      lobbyState.onlineUsers = lobbyState.onlineUsers.filter(u => u.id !== userId)
      
      // Broadcast updated state
      io.to('lobby').emit('lobby:state', lobbyState)
    })

    // Session management
    socket.on('session:create', ({ sessionData }) => {
      console.log('Creating session:', sessionData.name)
      
      try {
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        
        const session = {
          id: sessionId,
          name: sessionData.name,
          description: sessionData.description,
          caseId: sessionData.caseId,
          createdBy: sessionData.createdBy,
          createdAt: Date.now(),
          status: 'lobby',
          faculty: sessionData.faculty || [],
          learners: [],
          stage: sessionData.stage,
          settings: sessionData.settings || {
            maxLearners: 8,
            allowLateJoin: true,
            recordSession: true,
            publicJoin: false
          },
          currentStage: {
            items: [],
            minimized: [],
            history: []
          },
          timeline: []
        }

        // Save session (you'll need to implement saveSession)
        if (saveSession && saveSession(session)) {
          // Add to lobby state
          lobbyState.activeSessions.push(session)
          
          // Join creator to session room
          socket.join(`session:${sessionId}`)
          
          // Notify about session creation
          socket.emit('session:created', { session })
          io.to('lobby').emit('lobby:state', lobbyState)
        } else {
          socket.emit('error', { message: 'Failed to create session' })
        }
      } catch (e) {
        console.error('Session creation failed:', e)
        socket.emit('error', { message: 'Session creation failed' })
      }
    })

    socket.on('session:join', ({ sessionId, userId }) => {
      console.log('User joining session:', userId, sessionId)
      
      try {
        const session = lobbyState.activeSessions.find(s => s.id === sessionId)
        if (!session) {
          socket.emit('error', { message: 'Session not found' })
          return
        }

        // Check if user can join
        if (session.status === 'completed') {
          socket.emit('error', { message: 'Session is completed' })
          return
        }

        if (session.status === 'active' && !session.settings.allowLateJoin) {
          socket.emit('error', { message: 'Late join not allowed' })
          return
        }

        // Get user info (in real implementation, load from user storage)
        const userProfile = {
          id: userId,
          name: `User ${userId}`,
          role: 'learner' // Default, should be loaded from user data
        }

        const participant = {
          userId,
          userProfile,
          joinedAt: Date.now(),
          isActive: true,
          permissions: ['view', 'interact']
        }

        // Add user to appropriate list based on role
        if (userProfile.role === 'faculty') {
          session.faculty.push(participant)
        } else if (userProfile.role === 'stage') {
          session.stage = participant
        } else {
          if (session.learners.length >= session.settings.maxLearners) {
            socket.emit('error', { message: 'Session is full' })
            return
          }
          session.learners.push(participant)
        }

        // Join session room
        socket.join(`session:${sessionId}`)
        socket.sessionId = sessionId

        // Save updated session
        if (saveSession) saveSession(session)

        // Notify about user joining
        io.to(`session:${sessionId}`).emit('session:user-joined', { sessionId, participant })
        io.to('lobby').emit('lobby:state', lobbyState)
        
      } catch (e) {
        console.error('Session join failed:', e)
        socket.emit('error', { message: 'Failed to join session' })
      }
    })

    socket.on('session:leave', ({ sessionId, userId }) => {
      console.log('User leaving session:', userId, sessionId)
      
      try {
        const session = lobbyState.activeSessions.find(s => s.id === sessionId)
        if (session) {
          // Remove user from session
          session.faculty = session.faculty.filter(f => f.userId !== userId)
          session.learners = session.learners.filter(l => l.userId !== userId)
          if (session.stage?.userId === userId) {
            session.stage = undefined
          }

          // Leave session room
          socket.leave(`session:${sessionId}`)
          socket.sessionId = undefined

          // Save updated session
          if (saveSession) saveSession(session)

          // Notify about user leaving
          io.to(`session:${sessionId}`).emit('session:user-left', { sessionId, userId })
          io.to('lobby').emit('lobby:state', lobbyState)
        }
      } catch (e) {
        console.error('Session leave failed:', e)
      }
    })

    // Session control (faculty only)
    socket.on('session:start', ({ sessionId }) => {
      console.log('Starting session:', sessionId)
      
      try {
        const session = lobbyState.activeSessions.find(s => s.id === sessionId)
        if (session && session.status === 'lobby') {
          session.status = 'active'
          session.startedAt = Date.now()

          // Save updated session
          if (saveSession) saveSession(session)

          // Notify all participants
          io.to(`session:${sessionId}`).emit('session:started', { 
            sessionId, 
            startedAt: session.startedAt 
          })
          io.to('lobby').emit('lobby:state', lobbyState)
        }
      } catch (e) {
        console.error('Session start failed:', e)
      }
    })

    socket.on('session:pause', ({ sessionId }) => {
      console.log('Pausing session:', sessionId)
      
      try {
        const session = lobbyState.activeSessions.find(s => s.id === sessionId)
        if (session && session.status === 'active') {
          session.status = 'paused'
          session.pausedAt = Date.now()

          if (saveSession) saveSession(session)
          io.to(`session:${sessionId}`).emit('session:paused', { sessionId })
          io.to('lobby').emit('lobby:state', lobbyState)
        }
      } catch (e) {
        console.error('Session pause failed:', e)
      }
    })

    socket.on('session:resume', ({ sessionId }) => {
      console.log('Resuming session:', sessionId)
      
      try {
        const session = lobbyState.activeSessions.find(s => s.id === sessionId)
        if (session && session.status === 'paused') {
          session.status = 'active'
          session.pausedAt = undefined

          if (saveSession) saveSession(session)
          io.to(`session:${sessionId}`).emit('session:resumed', { sessionId })
          io.to('lobby').emit('lobby:state', lobbyState)
        }
      } catch (e) {
        console.error('Session resume failed:', e)
      }
    })

    socket.on('session:end', ({ sessionId }) => {
      console.log('Ending session:', sessionId)
      
      try {
        const session = lobbyState.activeSessions.find(s => s.id === sessionId)
        if (session) {
          session.status = 'completed'
          session.endedAt = Date.now()

          if (saveSession) saveSession(session)
          io.to(`session:${sessionId}`).emit('session:ended', { 
            sessionId, 
            endedAt: session.endedAt 
          })
          io.to('lobby').emit('lobby:state', lobbyState)
        }
      } catch (e) {
        console.error('Session end failed:', e)
      }
    })

    // Invitations
    socket.on('session:invite', ({ sessionId, userIds, message }) => {
      console.log('Sending invitations for session:', sessionId)
      
      try {
        const invitations = loadInvitations() || []
        const inviterUserId = socket.userId

        for (const userId of userIds) {
          const invitation = {
            id: `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sessionId,
            fromUserId: inviterUserId,
            toUserId: userId,
            createdAt: Date.now(),
            status: 'pending',
            message
          }

          invitations.push(invitation)
          
          // Notify the invited user if they're online
          const userSocket = [...io.sockets.sockets.values()]
            .find(s => s.userId === userId)
          
          if (userSocket) {
            userSocket.emit('session:invitation', { invitation })
          }
        }

        if (saveInvitations) saveInvitations(invitations)
        lobbyState.invitations = invitations

      } catch (e) {
        console.error('Invitation failed:', e)
      }
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('Socket disconnected:', socket.id)
      
      // Remove from online users
      if (socket.userId) {
        lobbyState.onlineUsers = lobbyState.onlineUsers.filter(u => u.id !== socket.userId)
        io.to('lobby').emit('lobby:state', lobbyState)
      }

      // Handle session cleanup if needed
      if (socket.sessionId) {
        const session = lobbyState.activeSessions.find(s => s.id === socket.sessionId)
        if (session && socket.userId) {
          // Mark user as inactive rather than removing immediately
          session.faculty.forEach(f => {
            if (f.userId === socket.userId) f.isActive = false
          })
          session.learners.forEach(l => {
            if (l.userId === socket.userId) l.isActive = false
          })
          if (session.stage?.userId === socket.userId) {
            session.stage.isActive = false
          }
        }
      }
    })
  })

  // Initialize lobby state
  refreshLobbyState()
}