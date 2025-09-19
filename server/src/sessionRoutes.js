// server/src/sessionRoutes.js
import { 
  loadSession, 
  saveSession, 
  listSessions,
  loadUser,
  saveUser,
  searchUsers,
  loadInvitations,
  saveInvitations
} from './sessionStorage.js'

export function registerSessionRoutes(app) {
  // Session routes
  app.get('/api/sessions', (req, res) => {
    try {
      let sessions = listSessions()
      
      // Filter by status if requested
      const status = req.query.status
      if (status) {
        sessions = sessions.filter(s => s.status === status)
      }
      
      // Filter active sessions (not completed)
      const activeOnly = req.query.active === 'true'
      if (activeOnly) {
        sessions = sessions.filter(s => s.status !== 'completed')
      }
      
      res.json(sessions)
    } catch (e) {
      console.error('Failed to list sessions:', e)
      res.status(500).json({ error: 'Failed to list sessions' })
    }
  })

  app.get('/api/sessions/:id', (req, res) => {
    try {
      const session = loadSession(req.params.id)
      if (!session) {
        return res.status(404).json({ error: 'Session not found' })
      }
      res.json(session)
    } catch (e) {
      console.error('Failed to get session:', e)
      res.status(500).json({ error: 'Failed to get session' })
    }
  })

  app.post('/api/sessions', (req, res) => {
    try {
      const sessionData = req.body
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

      if (saveSession(session)) {
        res.status(201).json(session)
      } else {
        res.status(500).json({ error: 'Failed to create session' })
      }
    } catch (e) {
      console.error('Failed to create session:', e)
      res.status(500).json({ error: 'Failed to create session' })
    }
  })

  app.put('/api/sessions/:id', (req, res) => {
    try {
      const sessionId = req.params.id
      const updates = req.body
      
      const session = loadSession(sessionId)
      if (!session) {
        return res.status(404).json({ error: 'Session not found' })
      }

      const updatedSession = { ...session, ...updates, id: sessionId }
      
      if (saveSession(updatedSession)) {
        res.json(updatedSession)
      } else {
        res.status(500).json({ error: 'Failed to update session' })
      }
    } catch (e) {
      console.error('Failed to update session:', e)
      res.status(500).json({ error: 'Failed to update session' })
    }
  })

  app.delete('/api/sessions/:id', (req, res) => {
    try {
      const sessionId = req.params.id
      const file = path.join(sessionsDir, `${sessionId}.json`)
      
      if (!fs.existsSync(file)) {
        return res.status(404).json({ error: 'Session not found' })
      }

      fs.unlinkSync(file)
      res.json({ ok: true })
    } catch (e) {
      console.error('Failed to delete session:', e)
      res.status(500).json({ error: 'Failed to delete session' })
    }
  })

  // User routes
  app.get('/api/users/search', (req, res) => {
    try {
      const query = req.query.q || ''
      const role = req.query.role || ''
      const users = searchUsers(query, role)
      res.json(users)
    } catch (e) {
      console.error('Failed to search users:', e)
      res.status(500).json({ error: 'Failed to search users' })
    }
  })

  app.get('/api/users/:id', (req, res) => {
    try {
      const user = loadUser(req.params.id)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      res.json(user)
    } catch (e) {
      console.error('Failed to get user:', e)
      res.status(500).json({ error: 'Failed to get user' })
    }
  })

  app.put('/api/users/profile', (req, res) => {
    try {
      const userData = req.body
      if (saveUser(userData)) {
        res.json(userData)
      } else {
        res.status(500).json({ error: 'Failed to save user profile' })
      }
    } catch (e) {
      console.error('Failed to save user profile:', e)
      res.status(500).json({ error: 'Failed to save user profile' })
    }
  })

  app.get('/api/users/:id/stats', (req, res) => {
    try {
      const user = loadUser(req.params.id)
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      res.json(user.stats || { sessionsCompleted: 0, casesCompleted: 0, totalTime: 0 })
    } catch (e) {
      console.error('Failed to get user stats:', e)
      res.status(500).json({ error: 'Failed to get user stats' })
    }
  })

  app.get('/api/users/:id/sessions', (req, res) => {
    try {
      const userId = req.params.id
      const sessions = listSessions().filter(session => 
        session.createdBy === userId ||
        session.faculty.some(f => f.userId === userId) ||
        session.learners.some(l => l.userId === userId) ||
        session.stage?.userId === userId
      )
      res.json(sessions)
    } catch (e) {
      console.error('Failed to get user sessions:', e)
      res.status(500).json({ error: 'Failed to get user sessions' })
    }
  })

  // Invitation routes
  app.get('/api/invitations', (req, res) => {
    try {
      const userId = req.query.userId
      let invitations = loadInvitations()
      
      if (userId) {
        invitations = invitations.filter(inv => inv.toUserId === userId && inv.status === 'pending')
      }
      
      res.json(invitations)
    } catch (e) {
      console.error('Failed to get invitations:', e)
      res.status(500).json({ error: 'Failed to get invitations' })
    }
  })

  app.post('/api/invitations/:id/respond', (req, res) => {
    try {
      const invitationId = req.params.id
      const { accept } = req.body
      
      const invitations = loadInvitations()
      const invitation = invitations.find(inv => inv.id === invitationId)
      
      if (!invitation) {
        return res.status(404).json({ error: 'Invitation not found' })
      }

      invitation.status = accept ? 'accepted' : 'declined'
      
      if (saveInvitations(invitations)) {
        res.json(invitation)
      } else {
        res.status(500).json({ error: 'Failed to respond to invitation' })
      }
    } catch (e) {
      console.error('Failed to respond to invitation:', e)
      res.status(500).json({ error: 'Failed to respond to invitation' })
    }
  })
}