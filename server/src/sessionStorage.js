// server/src/sessionStorage.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionsDir = path.resolve(__dirname, '../data/sessions')
const usersDir = path.resolve(__dirname, '../data/users')

// Ensure directories exist
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true })
if (!fs.existsSync(usersDir)) fs.mkdirSync(usersDir, { recursive: true })

// Session storage helpers
export function loadSession(sessionId) {
  try {
    const file = path.join(sessionsDir, `${sessionId}.json`)
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    console.error('Failed to load session:', e)
    return null
  }
}

export function saveSession(session) {
  try {
    const file = path.join(sessionsDir, `${session.id}.json`)
    fs.writeFileSync(file, JSON.stringify(session, null, 2))
    return true
  } catch (e) {
    console.error('Failed to save session:', e)
    return false
  }
}

export function listSessions() {
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json') && f !== 'invitations.json')
    return files.map(f => {
      try {
        const content = fs.readFileSync(path.join(sessionsDir, f), 'utf-8')
        return JSON.parse(content)
      } catch {
        return null
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}

// User storage helpers
export function loadUser(userId) {
  try {
    const file = path.join(usersDir, `${userId}.json`)
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    console.error('Failed to load user:', e)
    return null
  }
}

export function saveUser(user) {
  try {
    const file = path.join(usersDir, `${user.id}.json`)
    fs.writeFileSync(file, JSON.stringify(user, null, 2))
    return true
  } catch (e) {
    console.error('Failed to save user:', e)
    return false
  }
}

export function searchUsers(query, role) {
  try {
    const files = fs.readdirSync(usersDir).filter(f => f.endsWith('.json'))
    const users = files.map(f => {
      try {
        const content = fs.readFileSync(path.join(usersDir, f), 'utf-8')
        return JSON.parse(content)
      } catch {
        return null
      }
    }).filter(Boolean)

    return users.filter(user => {
      const matchesQuery = !query || 
        user.name.toLowerCase().includes(query.toLowerCase()) ||
        user.email.toLowerCase().includes(query.toLowerCase())
      const matchesRole = !role || user.role === role
      return matchesQuery && matchesRole
    })
  } catch {
    return []
  }
}

// Invitation storage helpers
const invitationsFile = path.join(sessionsDir, 'invitations.json')

export function loadInvitations() {
  try {
    if (!fs.existsSync(invitationsFile)) return []
    return JSON.parse(fs.readFileSync(invitationsFile, 'utf-8'))
  } catch {
    return []
  }
}

export function saveInvitations(invitations) {
  try {
    fs.writeFileSync(invitationsFile, JSON.stringify(invitations, null, 2))
    return true
  } catch (e) {
    console.error('Failed to save invitations:', e)
    return false
  }
}