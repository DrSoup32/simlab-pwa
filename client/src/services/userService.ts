// client/src/services/userService.ts
import { UserProfile, UserRole } from '../types/session'

const STORAGE_KEY = 'simlab-user-profile'

export class UserService {
  private static instance: UserService
  private currentUser: UserProfile | null = null

  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService()
    }
    return UserService.instance
  }

  // Get current user profile
  getCurrentUser(): UserProfile | null {
    if (this.currentUser) return this.currentUser
    
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        this.currentUser = JSON.parse(stored)
        return this.currentUser
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    return null
  }

  // Create or update user profile
  async setUser(userData: Partial<UserProfile>): Promise<UserProfile> {
    const existing = this.getCurrentUser()
    
    const user: UserProfile = {
      id: existing?.id || this.generateUserId(),
      name: userData.name || existing?.name || '',
      email: userData.email || existing?.email || '',
      role: userData.role || existing?.role || 'learner',
      avatar: userData.avatar || existing?.avatar,
      createdAt: existing?.createdAt || Date.now(),
      lastActive: Date.now(),
      preferences: {
        notifications: true,
        theme: 'light',
        ...existing?.preferences,
        ...userData.preferences
      },
      stats: {
        sessionsCompleted: 0,
        casesCompleted: 0,
        totalTime: 0,
        ...existing?.stats,
        ...userData.stats
      }
    }

    this.currentUser = user
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    
    // Sync with server
    try {
      await this.syncUserToServer(user)
    } catch (error) {
      console.warn('Failed to sync user to server:', error)
    }
    
    return user
  }

  // Clear current user (logout)
  clearUser(): void {
    this.currentUser = null
    localStorage.removeItem(STORAGE_KEY)
  }

  // Update user stats
  async updateStats(updates: Partial<UserProfile['stats']>): Promise<void> {
    const user = this.getCurrentUser()
    if (!user) return

    user.stats = { ...user.stats, ...updates }
    user.lastActive = Date.now()
    
    await this.setUser(user)
  }

  // Check if user is logged in
  isLoggedIn(): boolean {
    return this.getCurrentUser() !== null
  }

  // Get user display name
  getDisplayName(): string {
    const user = this.getCurrentUser()
    return user?.name || 'Anonymous'
  }

  // Get user role
  getRole(): UserRole | null {
    return this.getCurrentUser()?.role || null
  }

  // Generate unique user ID
  private generateUserId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  // Sync user profile to server
  private async syncUserToServer(user: UserProfile): Promise<void> {
    const response = await fetch('/api/users/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(user)
    })
    
    if (!response.ok) {
      throw new Error('Failed to sync user profile')
    }
  }

  // Load user profile from server
  async loadUserFromServer(userId: string): Promise<UserProfile | null> {
    try {
      const response = await fetch(`/api/users/${userId}`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.warn('Failed to load user from server:', error)
    }
    return null
  }

  // Search users (for invitations)
  async searchUsers(query: string, role?: UserRole): Promise<UserProfile[]> {
    try {
      const params = new URLSearchParams({ q: query })
      if (role) params.append('role', role)
      
      const response = await fetch(`/api/users/search?${params}`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.warn('Failed to search users:', error)
    }
    return []
  }

  // Get user leaderboard/stats
  async getUserStats(userId?: string): Promise<UserProfile['stats'] | null> {
    const targetUserId = userId || this.getCurrentUser()?.id
    if (!targetUserId) return null

    try {
      const response = await fetch(`/api/users/${targetUserId}/stats`)
      if (response.ok) {
        return await response.json()
      }
    } catch (error) {
      console.warn('Failed to load user stats:', error)
    }
    return null
  }
}