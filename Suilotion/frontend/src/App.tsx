import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Transaction } from '@mysten/sui/transactions'
import './App.css'

// Contract package ID - DEPLOYED (NFT Tier System - 2024)
const PACKAGE_ID = '0x20d90ee0b94abb3c75b1551532b96d51a697130b3f80e8cfdbeb4d8c9cce7ce0'
const REGISTRY_ID = '0xbc71e6fbb0cb92bb4490214f7af260ff8a638500f47f14a6d544df112a6428a5'

// 42 Intra OAuth Configuration
// TODO: Replace with your 42 OAuth App credentials
// Get them from: https://profile.intra.42.fr/oauth/applications
const INTRA_CLIENT_ID = import.meta.env.VITE_INTRA_CLIENT_ID || ''
const INTRA_REDIRECT_URI = import.meta.env.VITE_INTRA_REDIRECT_URI || window.location.origin
const INTRA_AUTH_URL = 'https://api.intra.42.fr/oauth/authorize'

const TOPICS = [
  { id: 0, name: 'Shell', icon: '🐚', color: '#22c55e' },
  { id: 1, name: 'Libft', icon: '📚', color: '#3b82f6' },
  { id: 2, name: 'get_next_line', icon: '📖', color: '#16a34a' },
  { id: 3, name: 'ft_printf', icon: '🖨️', color: '#f59e0b' },
  { id: 4, name: 'Born2beroot', icon: '🐧', color: '#ef4444' },
  { id: 5, name: 'minitalk', icon: '💬', color: '#06b6d4' },
  { id: 6, name: 'push_swap', icon: '🔄', color: '#ec4899' },
  { id: 7, name: 'minishell', icon: '💻', color: '#10b981' },
  { id: 8, name: 'Philosophers', icon: '🍝', color: '#f97316' },
  { id: 9, name: 'CPP Modules', icon: '⚡', color: '#6366f1' },
  { id: 10, name: 'cub3d', icon: '🎮', color: '#14b8a6' },
  { id: 11, name: 'miniRT', icon: '🌈', color: '#10b981' },
  { id: 12, name: 'webserv', icon: '🌐', color: '#0ea5e9' },
  { id: 13, name: 'ft_transcendence', icon: '🏆', color: '#eab308' },
]

interface HelpRequest {
  id: string
  owner: string
  topic: number
  title: string
  description: string
  created_at: string
  status: number
  vote_count: number
  community_difficulty: number
  offers?: string[] // Offer IDs
  mentor_addresses?: string[] // Addresses of mentors who have made offers
}

interface HelpOffer {
  id: string
  request_id: string
  mentor: string
  message: string
  competency_level: number
  past_helps_on_topic: number
  status: number // 0: Pending, 1: Accepted, 2: Rejected
  created_at: string
}

function App() {
  const account = useCurrentAccount()
  const client = useSuiClient()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  
  const [activeTab, setActiveTab] = useState<'requests' | 'create' | 'profile' | 'my-requests'>('requests')
  const [requests, setRequests] = useState<HelpRequest[]>([])
  const [myRequests, setMyRequests] = useState<HelpRequest[]>([])
  const [myOffers, setMyOffers] = useState<HelpOffer[]>([]) // Offers made by current user
  const [offers, setOffers] = useState<Map<string, HelpOffer[]>>(new Map()) // request_id -> offers
  const [selectedRequestForOffers, setSelectedRequestForOffers] = useState<HelpRequest | null>(null)
  const [showOffersModal, setShowOffersModal] = useState(false)
  const [mentorProfiles, setMentorProfiles] = useState<Map<string, any>>(new Map()) // mentor_address -> profile
  const [selectedMentorAddress, setSelectedMentorAddress] = useState<string | null>(null)
  const [showMentorProfileModal, setShowMentorProfileModal] = useState(false)
  const [mentorIntraData, setMentorIntraData] = useState<any>(null) // 42 Intra data for selected mentor
  const [notifiedOffers, setNotifiedOffers] = useState<Set<string>>(new Set()) // offer_id -> already notified
  // Load notified requests from localStorage on mount
  const [notifiedRequests, setNotifiedRequests] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('notifiedRequests')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })
  const [votedRequests, setVotedRequests] = useState<Set<string>>(new Set()) // request_id -> already voted by user
  const [loading, setLoading] = useState(false)
  const [votingRequest, setVotingRequest] = useState<string | null>(null) // request_id currently being voted on
  const claimedRewardsRef = useRef<Set<string>>(new Set()) // Track claimed rewards to prevent duplicates
  const [tierNFTs, setTierNFTs] = useState<any[]>([]) // User's tier NFTs
  const [showCloseRequestModal, setShowCloseRequestModal] = useState(false) // Modal for closing request
  const [selectedRequestToClose, setSelectedRequestToClose] = useState<HelpRequest | null>(null) // Request to close
  
  // Toast notification state
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'info'
    details?: string
  } | null>(null)
  const [formData, setFormData] = useState({
    topic: 0,
    title: '',
    description: '',
  })

  // Modal state for offering help
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<HelpRequest | null>(null)
  const [offerMessage, setOfferMessage] = useState('')
  const [competencyLevel, setCompetencyLevel] = useState(3)

  // Registry stats - real data from blockchain
  const [registryStats, setRegistryStats] = useState({
    totalRequests: 0,
    totalMatches: 0,
    totalCompletions: 0,
    activeMentors: 0,
    activeRequests: 0, // Active (unmatched) requests count
  })

  // User profile stats - real data from blockchain
  const [profileStats, setProfileStats] = useState({
    displayName: '',
    intraLogin: '',
    helpsGiven: 0,
    helpsReceived: 0,
    totalXP: 0,
    tier: 0,
    avgFeedback: 0,
    totalRewards: 0,
  })

  const [hasProfile, setHasProfile] = useState(false)
  const [profileFormData, setProfileFormData] = useState({
    displayName: '',
    intraLogin: '',
  })
  const [showProfileForm, setShowProfileForm] = useState(false)
  
  // 42 Intra Auth State
  const [isIntraAuthenticated, setIsIntraAuthenticated] = useState(false)
  const [intraUser, setIntraUser] = useState<{
    login: string
    first_name: string
    last_name: string
    email: string
    displayname?: string
    image?: string
    correction_point?: number
    wallet?: number
    location?: string | null
    cursus_users?: any[]
    projects_users?: any[]
  } | null>(null)

  // 42 Intra OAuth Functions
  useEffect(() => {
    // Check if user is already authenticated (from localStorage)
    const storedIntraUser = localStorage.getItem('intra_user')
    const storedIntraToken = localStorage.getItem('intra_token')
    
    if (storedIntraUser && storedIntraToken) {
      try {
        const user = JSON.parse(storedIntraUser)
        setIntraUser(user)
        setIsIntraAuthenticated(true)
      } catch (e) {
        console.error('Error parsing stored intra user:', e)
      }
    }

    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const state = urlParams.get('state')

    if (code && state === localStorage.getItem('oauth_state')) {
      handleIntraCallback(code)
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  const handleIntraLogin = () => {
    if (!INTRA_CLIENT_ID || INTRA_CLIENT_ID === 'your_client_id_here') {
      alert('42 Intra OAuth is not configured!\n\nPlease:\n1. Go to https://profile.intra.42.fr/oauth/applications\n2. Create a new OAuth application\n3. Copy the Client ID and Client Secret\n4. Update the .env file in the frontend folder\n5. Restart the development server\n\nFor now, you can still use the site, but you won\'t be able to create a profile without 42 Intra authentication.')
      return
    }

    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7)
    localStorage.setItem('oauth_state', state)

    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: INTRA_CLIENT_ID,
      redirect_uri: INTRA_REDIRECT_URI,
      response_type: 'code',
      scope: 'public',
      state: state,
    })

    // Open OAuth in same window (for MVP)
    window.location.href = `${INTRA_AUTH_URL}?${params.toString()}`
  }

  const handleIntraCallback = async (code: string) => {
    try {
      const clientSecret = import.meta.env.VITE_INTRA_CLIENT_SECRET || ''
      
      if (!clientSecret) {
        console.error('Client secret is missing!')
        alert('42 Intra OAuth is not fully configured. Please check your .env file.')
        return
      }

      console.log('Exchanging code for token via Vite proxy...')

      // Use Vite proxy to avoid CORS   efvfjcknm
      const formData = new URLSearchParams()
      formData.append('grant_type', 'authorization_code')
      formData.append('client_id', INTRA_CLIENT_ID)
      formData.append('client_secret', clientSecret)
      formData.append('code', code) 
      formData.append('redirect_uri', INTRA_REDIRECT_URI)

      const response = await fetch('/api/intra/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Token exchange failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })
        throw new Error(`Failed to get token: ${response.status} ${response.statusText}`)
      }

      const tokenData = await response.json()
      const accessToken = tokenData.access_token

      if (!accessToken) {
        console.error('No access token in response:', tokenData)
        throw new Error('No access token received')
      }

      console.log('Token received, fetching user info...')

      // Get user info (with all public data)
      const userResponse = await fetch('/api/intra/v2/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        console.error('User info fetch failed:', {
          status: userResponse.status,
          statusText: userResponse.statusText,
          error: errorText,
        })
        throw new Error(`Failed to get user info: ${userResponse.status} ${userResponse.statusText}`)
      }

      const userData = await userResponse.json()
      
      console.log('User data received:', userData)
      
      // Extract all relevant user data
      setIntraUser({
        login: userData.login || '',
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        email: userData.email || '',
        displayname: userData.displayname || userData.login || '',
        image: userData.image?.link || '',
        correction_point: userData.correction_point || 0,
        wallet: userData.wallet || 0,
        location: userData.location || null,
        cursus_users: userData.cursus_users || [],
        projects_users: userData.projects_users || [],
      })
      setIsIntraAuthenticated(true)
      
      // Store in localStorage
      localStorage.setItem('intra_user', JSON.stringify({
        login: userData.login || '',
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        email: userData.email || '',
        displayname: userData.displayname || userData.login || '',
        image: userData.image?.link || '',
        correction_point: userData.correction_point || 0,
        wallet: userData.wallet || 0,
        location: userData.location || null,
        cursus_users: userData.cursus_users || [],
        projects_users: userData.projects_users || [],
      }))
      localStorage.setItem('intra_token', accessToken)

      // Auto-fill profile form if not created
      if (!hasProfile) {
        const displayName = userData.displayname || 
                           `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 
                           userData.login || ''
        
        setProfileFormData({
          displayName: displayName,
          intraLogin: userData.login || '',
        })
        setShowProfileForm(true)
      }
    } catch (error: any) {
      console.error('Error in OAuth callback:', error)
      const errorMessage = error?.message || 'Unknown error'
      alert(`Failed to authenticate with 42 Intra.\n\nError: ${errorMessage}\n\nPlease check the browser console for more details.`)
    }
  }

  const handleIntraLogout = () => {
    localStorage.removeItem('intra_user')
    localStorage.removeItem('intra_token')
    localStorage.removeItem('oauth_state')
    setIntraUser(null)
    setIsIntraAuthenticated(false)
  }

  // Create profile function
  const createProfile = async () => {
    if (!account) {
      alert('Please connect your wallet first!')
      return
    }

    // Require 42 Intra authentication
    if (!isIntraAuthenticated || !intraUser) {
      alert('You must login with 42 Intra first to create a profile!\n\nPlease click "Login with 42 Intra" button.')
      return
    }

    if (!profileFormData.displayName.trim() || !profileFormData.intraLogin.trim()) {
      alert('Please fill in all fields!')
      return
    }

    setLoading(true)
    try {
      const tx = new Transaction()
      
      tx.moveCall({
        target: `${PACKAGE_ID}::peer_help::create_profile`,
        arguments: [
          tx.object(REGISTRY_ID), // PeerHelpRegistry
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(profileFormData.displayName))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(profileFormData.intraLogin))),
          tx.object('0x6'), // Clock
        ],
      })

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            console.log('✅ Profile created successfully:', result)
            alert('Profile created successfully!')
            setProfileFormData({ displayName: '', intraLogin: '' })
            setShowProfileForm(false)
            // Aggressively refresh profile data after creation (multiple times)
            if (fetchUserProfileRef.current) {
              console.log('🔄 Refreshing profile after creation...')
              // Immediate refresh
              await fetchUserProfileRef.current()
              
              // Refresh multiple times to catch blockchain updates
              setTimeout(async () => {
                console.log('🔄 Refresh 1 (1s delay)')
                await fetchUserProfileRef.current?.()
              }, 1000)
              
              setTimeout(async () => {
                console.log('🔄 Refresh 2 (3s delay)')
                await fetchUserProfileRef.current?.()
              }, 3000)
              
              setTimeout(async () => {
                console.log('🔄 Refresh 3 (5s delay)')
                await fetchUserProfileRef.current?.()
              }, 5000)
            }
          },
          onError: (error) => {
            console.error('Error:', error)
            const errorMsg = error?.message || String(error) || 'Unknown error'
            if (errorMsg.includes('insufficient') || errorMsg.includes('balance')) {
              alert('Insufficient SUI balance. You need at least 0.1 SUI for gas fees.')
            } else {
              alert(`Failed to create profile: ${errorMsg}`)
            }
          },
        }
      )
    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch mentor profile when modal opens (fallback)
  useEffect(() => {
    if (showMentorProfileModal && selectedMentorAddress && !mentorIntraData) {
      const mentorProfile = mentorProfiles.get(selectedMentorAddress)
      
      // If we have profile but no Intra data yet, fetch it
      if (mentorProfile?.intraLogin) {
        console.log('useEffect: Fetching 42 Intra data for:', mentorProfile.intraLogin)
        fetchMentorIntraData(mentorProfile.intraLogin)
      } else if (!mentorProfile) {
        // Fetch profile first, then Intra data
        fetchMentorProfile(selectedMentorAddress).then((profile) => {
          if (profile?.intraLogin) {
            console.log('useEffect: Profile fetched, now fetching 42 Intra data for:', profile.intraLogin)
            fetchMentorIntraData(profile.intraLogin)
          }
        })
      }
    } else if (!showMentorProfileModal) {
      setMentorIntraData(null)
    }
  }, [showMentorProfileModal, selectedMentorAddress, mentorIntraData])

  // Fetch user profile from blockchain - made available globally via ref
  const fetchUserProfileRef = useRef<(() => Promise<void>) | null>(null)
  
  const fetchUserProfile = useCallback(async () => {
    if (!client || !account) {
      console.log('⚠️ fetchUserProfile: No client or account')
      setHasProfile(false)
      return
    }

    try {
      console.log('🔍 fetchUserProfile: Starting fetch for address:', account.address)
      console.log('📦 Using PACKAGE_ID:', PACKAGE_ID)
      
      // Get all objects owned by user
      const ownedObjects = await client.getOwnedObjects({
        owner: account.address,
        options: {
          showType: true,
          showContent: true,
        },
      })

      console.log('📊 fetchUserProfile: Found', ownedObjects.data?.length || 0, 'owned objects')

      // Find StudentProfile object - ONLY from current package
      const expectedProfileType = `${PACKAGE_ID}::peer_help::StudentProfile`
      console.log('🔎 Looking for profile type:', expectedProfileType)
      
      const profileObj = ownedObjects.data.find((obj: any) => {
        const objType = obj.data?.type
        const matches = objType === expectedProfileType
        if (matches || objType?.includes('StudentProfile')) {
          console.log('📋 Found profile object:', {
            type: objType,
            matches,
            hasData: !!obj.data,
            hasContent: !!(obj.data && 'content' in obj.data),
            hasFields: !!(obj.data && 'content' in obj.data && obj.data.content && 'fields' in obj.data.content)
          })
        }
        return matches
      })

      if (profileObj && profileObj.data && 'content' in profileObj.data && profileObj.data.content && 'fields' in profileObj.data.content) {
        const fields = profileObj.data.content.fields as any
        
        console.log('✅ fetchUserProfile: Profile found! Raw fields:', fields)
        
        const newStats = {
          displayName: fields.display_name || '',
          intraLogin: fields.intra_login || '',
          helpsGiven: Number(fields.helps_given || 0),
          helpsReceived: Number(fields.helps_received || 0),
          totalXP: Number(fields.total_xp || 0),
          tier: Number(fields.tier || 0),
          avgFeedback: Number(fields.avg_feedback_score || 0),
          totalRewards: Number(fields.total_rewards_earned || 0),
        }
        
        console.log('📊 Profile stats updated:', {
          displayName: newStats.displayName,
          intraLogin: newStats.intraLogin,
          helpsGiven: newStats.helpsGiven,
          helpsReceived: newStats.helpsReceived,
          totalXP: newStats.totalXP,
          tier: newStats.tier,
          avgFeedback: newStats.avgFeedback,
          totalRewards: newStats.totalRewards,
        })
        
        setProfileStats(newStats)
        setHasProfile(true)

        // Fetch user's TierNFTs
        try {
          const nftObjects = await client.getOwnedObjects({
            owner: account.address,
            filter: { StructType: `${PACKAGE_ID}::peer_help::TierNFT` },
            options: { showContent: true, showType: true }
          })

          if (nftObjects.data && nftObjects.data.length > 0) {
            const nfts = nftObjects.data
              .filter((obj: any) => obj.data && 'content' in obj.data && obj.data.content && 'fields' in obj.data.content)
              .map((obj: any) => {
                const fields = obj.data.content.fields as any
                return {
                  id: obj.data.objectId,
                  tier: Number(fields.tier || 0),
                  tierName: fields.tier_name || '',
                  mintedAt: Number(fields.minted_at || 0),
                  helpsGiven: Number(fields.helps_given || 0),
                }
              })
              .sort((a: any, b: any) => b.tier - a.tier) // Sort by tier (highest first)

            console.log('🎨 Tier NFTs fetched:', nfts)
            setTierNFTs(nfts)
          } else {
            setTierNFTs([])
          }
        } catch (error) {
          console.error('Error fetching TierNFTs:', error)
          setTierNFTs([])
        }
      } else {
        console.log('❌ fetchUserProfile: Profile not found or invalid structure')
        console.log('Profile object:', profileObj)
        if (profileObj) {
          console.log('Profile data:', profileObj.data)
        }
        setHasProfile(false)
      }
    } catch (error) {
      console.error('❌ Error fetching user profile:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      setHasProfile(false)
    }
  }, [client, account, PACKAGE_ID])

  // Store ref for global access
  fetchUserProfileRef.current = fetchUserProfile

  useEffect(() => {
    fetchUserProfile()
    // Refresh very frequently to catch updates (every 1 second for immediate responsiveness)
    const interval = setInterval(fetchUserProfile, 1000)
    return () => clearInterval(interval)
  }, [fetchUserProfile])

  // Fetch registry stats from blockchain
  useEffect(() => {
    const fetchRegistryStats = async () => {
      if (!client) return

      try {
        const registryObject = await client.getObject({
          id: REGISTRY_ID,
          options: { showContent: true },
        })

        if (registryObject.data && 'content' in registryObject.data && registryObject.data.content && 'fields' in registryObject.data.content) {
          const fields = registryObject.data.content.fields as any
          setRegistryStats(prev => ({
            totalRequests: Number(fields.total_requests || 0),
            totalMatches: Number(fields.total_matches || 0),
            totalCompletions: Number(fields.total_completions || 0),
            activeMentors: Math.floor(Number(fields.total_matches || 0) * 0.7), // Estimate
            activeRequests: prev.activeRequests, // Keep existing value, will be updated by fetchHelpRequests
          }))
        }
      } catch (error) {
        console.error('Error fetching registry stats:', error)
      }
    }

    fetchRegistryStats()
    // Update more frequently (every 5 seconds) for better real-time updates
    const interval = setInterval(fetchRegistryStats, 5000)
    return () => clearInterval(interval)
  }, [client, REGISTRY_ID])

  // Fetch real help requests from blockchain
  useEffect(() => {
    const fetchHelpRequests = async () => {
      if (!client) return

      try {
        setLoading(true)
        
        
        // Query HelpRequestCreated events
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::HelpRequestCreated`,
          },
          order: 'descending',
          limit: 50, // Get last 50 requests
        })

        if (!events.data || events.data.length === 0) {
          // Don't clear requests if they exist, just stop loading
          setLoading(false)
          return
        }

        // Extract request IDs from events
        const requestIds = events.data
          .map((event: any) => {
            const parsedJson = event.parsedJson as any
            return parsedJson?.request_id
          })
          .filter((id: string) => id)

        // Fetch all request objects
        const requestObjects = await Promise.all(
          requestIds.map(async (id: string) => {
            try {
              const obj = await client.getObject({
                id,
                options: {
                  showContent: true,
                  showType: true,
                },
              })

              if (obj.data && 'content' in obj.data && obj.data.content && 'fields' in obj.data.content) {
                const fields = obj.data.content.fields as any
                const request: HelpRequest = {
                  id: id,
                  owner: fields.requester || '',
                  topic: Number(fields.topic || 0),
                  title: fields.title || '',
                  description: fields.description || '',
                  created_at: new Date(Number(fields.created_at || 0)).toISOString(),
                  status: Number(fields.status || 0),
                  vote_count: Number(fields.difficulty_vote_count || 0),
                  community_difficulty: Number(fields.community_difficulty || 0),
                }
                if (fields.offers) {
                  request.offers = fields.offers
                }
                if (fields.mentor_addresses) {
                  request.mentor_addresses = fields.mentor_addresses
                }
                return request
              }
              return null
            } catch (error) {
              console.error(`Error fetching request ${id}:`, error)
              return null
            }
          })
        )

        // Filter out nulls and only show open requests (status 0)
        const validRequests = requestObjects
          .filter((req): req is HelpRequest => req !== null)
          .filter(req => req.status === 0 && req.community_difficulty !== undefined)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setRequests(validRequests)
        
        // Update active requests count (only unmatched requests, status = 0)
        setRegistryStats(prev => ({
          ...prev,
          activeRequests: validRequests.length
        }))
      } catch (error: any) {
        console.error('Error fetching help requests:', error)
        // If package doesn't exist, contract not deployed yet
        if (error?.message?.includes('does not exist') || error?.message?.includes('Package')) {
          console.log('Contract not deployed yet. Please deploy the contract first.')
        }
        // Don't clear requests on error, just log it
        console.error('Error fetching requests, keeping existing data')
      } finally {
        setLoading(false)
      }
    }

    fetchHelpRequests()
    
    // Refresh every 10 seconds
    const interval = setInterval(fetchHelpRequests, 10000)
    
    return () => clearInterval(interval)
  }, [client, PACKAGE_ID])

  // Fetch my requests (requests I created)
  useEffect(() => {
    const fetchMyRequests = async () => {
      if (!client || !account) {
        // Don't clear myRequests if client/account not available
        return
      }

      try {
        // Fetch all HelpRequestCreated events
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::HelpRequestCreated`,
          },
          order: 'descending',
          limit: 100, // Get more events to filter
        })

        if (!events.data || events.data.length === 0) {
          // Don't clear myRequests if they exist
          return
        }

        // Filter events by requester (the person who created the request)
        const myRequestEvents = events.data.filter((event: any) => {
          const parsedJson = event.parsedJson as any
          return parsedJson?.requester?.toLowerCase() === account.address.toLowerCase()
        })

        if (myRequestEvents.length === 0) {
          // Don't clear myRequests if they exist
          return
        }

        const requestIds = myRequestEvents
          .map((event: any) => {
            const parsedJson = event.parsedJson as any
            return parsedJson?.request_id
          })
          .filter((id: string) => id)

        const requestObjects = await Promise.all(
          requestIds.map(async (id: string) => {
            try {
              const obj = await client.getObject({
                id,
                options: {
                  showContent: true,
                  showType: true,
                },
              })

              if (obj.data && 'content' in obj.data && obj.data.content && 'fields' in obj.data.content) {
                const fields = obj.data.content.fields as any
                const request: HelpRequest = {
                  id: id,
                  owner: fields.requester || '',
                  topic: Number(fields.topic || 0),
                  title: fields.title || '',
                  description: fields.description || '',
                  created_at: new Date(Number(fields.created_at || 0)).toISOString(),
                  status: Number(fields.status || 0),
                  vote_count: Number(fields.difficulty_vote_count || 0),
                  community_difficulty: Number(fields.community_difficulty || 0),
                }
                if (fields.offers) {
                  request.offers = fields.offers
                }
                return request
              }
              return null
            } catch (error) {
              console.error(`Error fetching request ${id}:`, error)
              return null
            }
          })
        )

        const validRequests = requestObjects
          .filter((req): req is HelpRequest => req !== null)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setMyRequests(validRequests)

        // Fetch offers for all my requests
        for (const request of validRequests) {
          if (request.offers && request.offers.length > 0) {
            await fetchOffersForRequest(request.id, request.offers)
          }
        }
      } catch (error) {
        console.error('Error fetching my requests:', error)
        // Don't clear myRequests on error, just log it
      }
    }

    fetchMyRequests()
    // Refresh more frequently to catch completed status updates
    const interval = setInterval(fetchMyRequests, 5000)
    return () => clearInterval(interval)
  }, [client, account, PACKAGE_ID])

  // Fetch my offers (offers I made as a mentor)
  useEffect(() => {
    const fetchMyOffers = async () => {
      if (!client || !account) {
        // Don't clear myOffers if client/account not available
        return
      }

      try {
        // Query HelpOfferCreated events
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::HelpOfferCreated`,
          },
          order: 'descending',
          limit: 100,
        })

        if (!events.data || events.data.length === 0) {
          // Don't clear myOffers if they exist
          return
        }

        // Filter events by mentor (current user)
        const myOfferEvents = events.data.filter((event: any) => {
          const parsedJson = event.parsedJson as any
          return parsedJson?.mentor?.toLowerCase() === account.address.toLowerCase()
        })

        if (myOfferEvents.length === 0) {
          // Don't clear myOffers if they exist
          return
        }

        // Fetch offer objects and their related requests
        const offerPromises = myOfferEvents.map(async (event: any) => {
          const parsedJson = event.parsedJson as any
          const offerId = parsedJson?.offer_id
          const requestId = parsedJson?.request_id

          if (!offerId || !requestId) return null

          try {
            // Fetch offer object
            const offerObj = await client.getObject({
              id: offerId,
              options: {
                showContent: true,
                showType: true,
              },
            })

            // Fetch request object to get title and status
            const requestObj = await client.getObject({
              id: requestId,
              options: {
                showContent: true,
                showType: true,
              },
            })

            if (offerObj.data && 'content' in offerObj.data && offerObj.data.content && 'fields' in offerObj.data.content) {
              const offerFields = offerObj.data.content.fields as any
              const requestFields = requestObj.data && 'content' in requestObj.data && requestObj.data.content && 'fields' in requestObj.data.content
                ? (requestObj.data.content.fields as any)
                : null

              // Check if there's a match for this offer and if it's completed
              let matchStatus = 'pending' // pending, matched, completed
              
              try {
                // Check for matches
                const matchEvents = await client.queryEvents({
                  query: {
                    MoveEventType: `${PACKAGE_ID}::peer_help::MatchCreated`,
                  },
                  order: 'descending',
                  limit: 50,
                })

                const match = matchEvents.data.find((matchEvent: any) => {
                  const matchParsed = matchEvent.parsedJson as any
                  return matchParsed?.request_id === requestId && matchParsed?.helper?.toLowerCase() === account.address.toLowerCase()
                })

                if (match) {
                  const matchParsed = match.parsedJson as any
                  const matchId = matchParsed?.match_id
                  
                  // Check if the match is completed
                  const completedEvents = await client.queryEvents({
                    query: {
                      MoveEventType: `${PACKAGE_ID}::peer_help::HelpCompleted`,
                    },
                    order: 'descending',
                    limit: 50,
                  })

                  const isCompleted = completedEvents.data.some((event: any) => {
                    const parsed = event.parsedJson as any
                    return parsed?.match_id === matchId
                  })

                  if (isCompleted) {
                    matchStatus = 'completed'
                  } else {
                    matchStatus = 'matched'
                  }
                }
              } catch (error) {
                console.error('Error checking match status:', error)
              }
              
              // Also check request status (status 2 = completed)
              if (requestFields && Number(requestFields.status) === 2) {
                matchStatus = 'completed'
              }

              return {
                id: offerId,
                request_id: requestId,
                mentor: offerFields.mentor || account.address,
                message: offerFields.message || '',
                competency_level: Number(offerFields.competency_level || 0),
                past_helps_on_topic: Number(offerFields.past_helps_on_topic || 0),
                status: Number(offerFields.status || 0), // 0: Pending, 1: Accepted, 2: Rejected
                created_at: new Date(Number(offerFields.created_at || 0)).toISOString(),
                request_title: requestFields?.title || 'Unknown Request',
                request_status: requestFields ? Number(requestFields.status || 0) : 0, // 0: Open, 1: Matched, 2: Completed
                match_status: matchStatus,
              } as HelpOffer & { request_title: string; request_status: number; match_status: string }
            }
            return null
          } catch (error) {
            console.error(`Error fetching offer ${offerId}:`, error)
            return null
          }
        })

        const validOffers = (await Promise.all(offerPromises))
          .filter((offer): offer is HelpOffer & { request_title: string; request_status: number; match_status: string } => offer !== null)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        setMyOffers(validOffers as any)
      } catch (error) {
        console.error('Error fetching my offers:', error)
        // Don't clear myOffers on error, just log it
      }
    }

    fetchMyOffers()
    // Refresh every 15 seconds (reduced frequency to avoid constant updates)
    const interval = setInterval(fetchMyOffers, 15000)
    return () => clearInterval(interval)
  }, [client, account, PACKAGE_ID])

  // Listen for MatchCreated events to notify mentor when their offer is accepted
  useEffect(() => {
    if (!client || !account) return

    const notifiedMatches = new Set<string>() // Track notified matches to avoid duplicates

    const checkForNewMatches = async () => {
      try {
        // Query recent MatchCreated events
        const matchEvents = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::MatchCreated`,
          },
          order: 'descending',
          limit: 20,
        })

        // Check if current user is a mentor in any recent match
        for (const event of matchEvents.data) {
          const parsed = event.parsedJson as any
          const matchId = parsed?.match_id
          const helper = parsed?.helper?.toLowerCase()
          const requester = parsed?.requester?.toLowerCase()
          const userAddress = account.address.toLowerCase()

          // If user is the mentor (helper) and hasn't been notified yet
          if (helper === userAddress && matchId && !notifiedMatches.has(matchId)) {
            notifiedMatches.add(matchId)

            // Fetch request and mentee profile to get email info
            try {
              const requestId = parsed?.request_id
              if (requestId) {
                const requestObj = await client.getObject({
                  id: requestId,
                  options: { showContent: true },
                })

                let requestTitle = 'Unknown Request'
                let menteeAddress = requester

                if (requestObj.data && 'content' in requestObj.data && requestObj.data.content && 'fields' in requestObj.data.content) {
                  const fields = requestObj.data.content.fields as any
                  requestTitle = fields.title || 'Unknown Request'
                }

                // Fetch mentee profile for email
                let menteeEmail = null
                if (menteeAddress) {
                  try {
                    const menteeObjects = await client.getOwnedObjects({
                      owner: menteeAddress,
                      options: { showType: true, showContent: true },
                    })
                    const menteeProfileObj = menteeObjects.data.find((obj: any) => 
                      obj.data?.type?.includes('::peer_help::StudentProfile')
                    )
                    if (menteeProfileObj && menteeProfileObj.data && 'content' in menteeProfileObj.data && menteeProfileObj.data.content && 'fields' in menteeProfileObj.data.content) {
                      const fields = menteeProfileObj.data.content.fields as any
                      const intraLogin = fields.intra_login
                      if (intraLogin) {
                        menteeEmail = `${intraLogin}@student.42istanbul.com.tr`
                      }
                    }
                  } catch (e) {
                    console.error('Error fetching mentee profile:', e)
                  }
                }

                // Fetch mentor profile for email
                let mentorEmail = null
                try {
                  const mentorObjects = await client.getOwnedObjects({
                    owner: userAddress,
                    options: { showType: true, showContent: true },
                  })
                  const mentorProfileObj = mentorObjects.data.find((obj: any) => 
                    obj.data?.type?.includes('::peer_help::StudentProfile')
                  )
                  if (mentorProfileObj && mentorProfileObj.data && 'content' in mentorProfileObj.data && mentorProfileObj.data.content && 'fields' in mentorProfileObj.data.content) {
                    const fields = mentorProfileObj.data.content.fields as any
                    const intraLogin = fields.intra_login
                    if (intraLogin) {
                      mentorEmail = `${intraLogin}@student.42istanbul.com.tr`
                    }
                  }
                } catch (e) {
                  console.error('Error fetching mentor profile:', e)
                }

                // Show toast to mentor
                let emailDetails = ''
                if (mentorEmail && menteeEmail) {
                  emailDetails = `Your Email: ${mentorEmail}\nMentee Email: ${menteeEmail}\n\nYou can now contact each other via email!`
                } else if (mentorEmail) {
                  emailDetails = `Your Email: ${mentorEmail}\n(Mentee's 42 Intra login not found)`
                } else if (menteeEmail) {
                  emailDetails = `Mentee Email: ${menteeEmail}\n(Your 42 Intra login not found in profile)`
                }

                setToast({
                  show: true,
                  message: '🎉 Your offer was accepted! You are now matched!',
                  type: 'success',
                  details: emailDetails || undefined
                })

                // Auto-hide toast after 45 seconds
                setTimeout(() => {
                  setToast(null)
                }, 45000)

                // Send browser notification to mentor
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification('🎉 Offer Accepted!', {
                    body: `Your offer for "${requestTitle}" was accepted! Check your email for contact information.`,
                    icon: '/favicon.ico',
                    tag: `offer-accepted-mentor-${matchId}`
                  })
                } else if ('Notification' in window && Notification.permission === 'default') {
                  Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                      new Notification('🎉 Offer Accepted!', {
                        body: `Your offer for "${requestTitle}" was accepted! Check your email for contact information.`,
                        icon: '/favicon.ico',
                        tag: `offer-accepted-mentor-${matchId}`
                      })
                    }
                  })
                }
              }
            } catch (error) {
              console.error('Error fetching match details:', error)
            }
          }
        }
      } catch (error) {
        console.error('Error checking for new matches:', error)
      }
    }

    // Check immediately and then every 5 seconds
    checkForNewMatches()
    const interval = setInterval(checkForNewMatches, 5000)
    return () => clearInterval(interval)
  }, [client, account, PACKAGE_ID])

  // Listen for new offers
  useEffect(() => {
    if (!client || !account) return

    const checkForNewOffers = async () => {
      try {
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::HelpOfferCreated`,
          },
          order: 'descending',
          limit: 20,
        })

        if (events.data && events.data.length > 0) {
          for (const event of events.data) {
            const parsedJson = event.parsedJson as any
            const requestId = parsedJson?.request_id
            const offerId = parsedJson?.offer_id

            // Skip if we already notified about this offer
            if (!offerId || notifiedOffers.has(offerId)) {
              continue
            }

            // Check if this offer is for one of my requests
            const myRequest = myRequests.find(req => req.id === requestId)
            if (myRequest && offerId) {
              // Skip if already notified
              if (notifiedOffers.has(offerId)) {
                continue
              }
              
              // Mark as notified
              setNotifiedOffers(prev => new Set(prev).add(offerId))
              
              // Fetch the offer silently (no alert)
              if (myRequest.offers) {
                await fetchOffersForRequest(requestId, [...myRequest.offers, offerId])
              } else {
                await fetchOffersForRequest(requestId, [offerId])
              }
              
              // No alert - user can check "My Requests" tab to see new offers
              console.log('New offer received for your request:', {
                requestId,
                requestTitle: myRequest.title,
                offerId
              })
            }
          }
        }
      } catch (error) {
        console.error('Error checking for new offers:', error)
      }
    }

    checkForNewOffers()
    const interval = setInterval(checkForNewOffers, 15000)
    return () => clearInterval(interval)
  }, [client, account, myRequests, PACKAGE_ID, notifiedOffers])

  // Listen for new help requests to notify all users
  useEffect(() => {
    if (!client || !account) return

    const checkForNewRequests = async () => {
      try {
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::HelpRequestCreated`,
          },
          order: 'descending',
          limit: 20,
        })

        // Load notified requests from localStorage to ensure persistence across page reloads
        let storedNotified: Set<string>
        try {
          const stored = localStorage.getItem('notifiedRequests')
          storedNotified = stored ? new Set(JSON.parse(stored)) : new Set()
        } catch {
          storedNotified = new Set()
        }

        if (events.data && events.data.length > 0) {
          for (const event of events.data) {
            const parsedJson = event.parsedJson as any
            const requestId = parsedJson?.request_id
            const requester = parsedJson?.requester?.toLowerCase()
            const userAddress = account.address.toLowerCase()

            // Skip if we already notified about this request (check both state and localStorage)
            if (!requestId || notifiedRequests.has(requestId) || storedNotified.has(requestId)) {
              continue
            }

            // Don't notify the requester about their own request
            if (requester === userAddress) {
              continue
            }

            // Mark as notified (both in state and localStorage)
            setNotifiedRequests(prev => {
              const updated = new Set(prev).add(requestId)
              try {
                localStorage.setItem('notifiedRequests', JSON.stringify(Array.from(updated)))
              } catch (e) {
                console.error('Failed to save notified requests to localStorage:', e)
              }
              return updated
            })

            const requestTitle = parsedJson?.title || 'New Help Request'
            const topicId = parsedJson?.topic || 0
            const topic = TOPICS[topicId] || { name: 'Unknown', icon: '❓' }

            // Show toast notification
            setToast({
              show: true,
              message: `New Help Request: ${requestTitle}`,
              type: 'info',
              details: `${topic.icon} ${topic.name} - Vote on difficulty to help the community!`
            })

            // Auto-hide after 10 seconds
            setTimeout(() => {
              setToast(null)
            }, 10000)

            // Send browser notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('📢 New Help Request', {
                body: `${requestTitle} - ${topic.name}`,
                icon: '/favicon.ico',
                tag: `request-${requestId}`
              })
            } else if ('Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission()
            }
          }
        }
      } catch (error) {
        console.error('Error checking for new requests:', error)
      }
    }

    // Check immediately and then every 10 seconds
    checkForNewRequests()
    const interval = setInterval(checkForNewRequests, 10000)
    return () => clearInterval(interval)
  }, [client, account, PACKAGE_ID, notifiedRequests])

  // Listen for HelpCompleted events to refresh profile (for XP updates)
  useEffect(() => {
    if (!client || !account) return

    const checkForCompletedHelps = async () => {
      try {
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::HelpCompleted`,
          },
          order: 'descending',
          limit: 20,
        })

        if (events.data && events.data.length > 0) {
          // Check if current user is the mentor in any recent completion
          for (const event of events.data) {
            const parsed = event.parsedJson as any
            const mentor = parsed?.mentor?.toLowerCase()
            const userAddress = account.address.toLowerCase()

            // If user is the mentor, refresh their profile to update XP
            if (mentor === userAddress) {
              // Refresh profile immediately to show updated XP
              if (fetchUserProfileRef.current) {
                await fetchUserProfileRef.current()
              }
              break // Only need to refresh once
            }
          }
        }
      } catch (error) {
        console.error('Error checking for completed helps:', error)
      }
    }

    // Check immediately and then every 5 seconds
    checkForCompletedHelps()
    const interval = setInterval(checkForCompletedHelps, 5000)
    return () => clearInterval(interval)
  }, [client, account, PACKAGE_ID])

  // Listen for MentorRewardPending events and automatically claim rewards
  useEffect(() => {
    if (!client || !account || !signAndExecute) return

    // Load claimed rewards from localStorage on mount
    try {
      const stored = localStorage.getItem('claimedRewards')
      if (stored) {
        claimedRewardsRef.current = new Set(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Error loading claimed rewards from localStorage:', e)
    }

    const checkForPendingRewards = async () => {
      try {
        console.log('🔍 Checking for MentorRewardPending events...')
        const events = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::MentorRewardPending`,
          },
          order: 'descending',
          limit: 50,
        })

        console.log(`📊 Found ${events.data?.length || 0} MentorRewardPending events`)

        if (events.data && events.data.length > 0) {
          for (const event of events.data) {
            const parsed = event.parsedJson as any
            const mentor = parsed?.mentor?.toLowerCase()
            const userAddress = account.address.toLowerCase()
            const matchId = parsed?.match_id
            const requestId = parsed?.request_id

            console.log('📋 Event details:', {
              mentor,
              userAddress,
              matchId,
              requestId,
              isMentor: mentor === userAddress
            })

            // Check if current user is the mentor and reward not yet claimed
            if (mentor === userAddress && matchId && requestId) {
              const rewardKey = `${matchId}-${requestId}`

              // Skip if already claimed
              if (claimedRewardsRef.current.has(rewardKey)) {
                console.log('⏭️ Reward already claimed in localStorage, skipping:', rewardKey)
                console.log('💡 To test again, clear localStorage: localStorage.removeItem("claimedRewards")')
                continue
              }

              console.log('✅ Found NEW pending reward for current user:', rewardKey)
              console.log('🎯 Will attempt to claim this reward...')

              try {
                // Get required objects
                const matchObj = await client.getObject({
                  id: matchId,
                  options: { showContent: true, showType: true }
                })
                const requestObj = await client.getObject({
                  id: requestId,
                  options: { showContent: true, showType: true }
                })
                const profileObj = await client.getOwnedObjects({
                  owner: account.address,
                  filter: { StructType: `${PACKAGE_ID}::peer_help::StudentProfile` },
                  options: { showContent: true, showType: true }
                })

                if (matchObj.data && requestObj.data && profileObj.data && profileObj.data.length > 0) {
                  const mentorProfileObj = profileObj.data[0]

                  if (!mentorProfileObj.data) {
                    continue
                  }

                  // Pre-check: Verify reward is claimable before building transaction
                  if (matchObj.data && 'content' in matchObj.data && matchObj.data.content && 'fields' in matchObj.data.content) {
                    const matchFields = (matchObj.data.content as any).fields
                    if (requestObj.data && 'content' in requestObj.data && requestObj.data.content && 'fields' in requestObj.data.content) {
                      const requestFields = (requestObj.data.content as any).fields

                      console.log('🔍 Pre-check:', {
                        reward_claimed: requestFields.reward_claimed,
                        match_status: matchFields.status,
                        mentee_confirmed: matchFields.mentee_confirmed,
                        match_status_type: typeof matchFields.status
                      })

                      // Skip if already claimed or match not completed
                      // Note: matchFields.status might be a number or string, so we check both
                      const matchStatus = matchFields.status
                      const isCompleted = matchStatus === 1 || matchStatus === '1' || String(matchStatus) === '1'
                      
                      if (requestFields.reward_claimed || !isCompleted || !matchFields.mentee_confirmed) {
                        console.log('⏭️ Pre-check failed, marking as claimed:', {
                          reward_claimed: requestFields.reward_claimed,
                          status: matchFields.status,
                          status_type: typeof matchFields.status,
                          isCompleted,
                          mentee_confirmed: matchFields.mentee_confirmed
                        })
                        // Mark as claimed to prevent future checks
                        claimedRewardsRef.current.add(rewardKey)
                        try {
                          localStorage.setItem('claimedRewards', JSON.stringify(Array.from(claimedRewardsRef.current)))
                        } catch (e) {}
                        continue
                      }
                    }
                  }

                  console.log('✅ Pre-check passed! Building transaction...')
                  console.log('📋 Transaction details:', {
                    matchId,
                    requestId,
                    profileId: mentorProfileObj.data.objectId,
                    registryId: REGISTRY_ID
                  })

                  // Mark as claimed to prevent duplicates
                  claimedRewardsRef.current.add(rewardKey)
                  try {
                    localStorage.setItem('claimedRewards', JSON.stringify(Array.from(claimedRewardsRef.current)))
                  } catch (e) {}

                  // Build transaction
                  console.log('🔨 Building mentor_claim_reward transaction...', {
                    registry: REGISTRY_ID,
                    matchId,
                    requestId,
                    profileId: mentorProfileObj.data.objectId
                  })
                  
                  const tx = new Transaction()
                  tx.moveCall({
                    target: `${PACKAGE_ID}::peer_help::mentor_claim_reward`,
                    arguments: [
                      tx.object(REGISTRY_ID),
                      tx.object(matchId),
                      tx.object(requestId),
                      tx.object(mentorProfileObj.data.objectId),
                      tx.object('0x6'), // Clock
                    ],
                  })

                  console.log('📤 Executing transaction...')
                  // Execute transaction
                  signAndExecute(
                    { transaction: tx },
                    {
                      onSuccess: async (result) => {
                        console.log('✅ Reward claimed successfully!', result)
                        console.log('🔄 Refreshing profile immediately...')
                        
                        // Refresh profile immediately and multiple times to ensure update
                        if (fetchUserProfileRef.current) {
                          // Immediate refresh
                          await fetchUserProfileRef.current()
                          
                          // Refresh again after 1 second
                          setTimeout(() => {
                            fetchUserProfileRef.current?.()
                          }, 1000)
                          
                          // Refresh again after 3 seconds
                          setTimeout(() => {
                            fetchUserProfileRef.current?.()
                          }, 3000)
                          
                          // Refresh again after 5 seconds
                          setTimeout(() => {
                            fetchUserProfileRef.current?.()
                          }, 5000)
                        }
                        
                        // Show success toast
                        setToast({
                          show: true,
                          message: 'Reward claimed! Your helps_given and XP have been updated.',
                          type: 'success'
                        })
                        setTimeout(() => setToast(null), 5000)
                      },
                      onError: (error) => {
                        console.error('❌ Error claiming reward:', error)
                        console.error('Error details:', JSON.stringify(error, null, 2))
                        
                        // If error is "already claimed" or "Reward not yet claimed", keep it marked
                        const errorMsg = error?.message || ''
                        if (errorMsg.includes('already claimed') || errorMsg.includes('Reward not yet claimed') || errorMsg.includes('assertion failure')) {
                          console.log('⚠️ Reward already claimed or assertion failed, keeping marked')
                          // Keep it marked as claimed
                        } else {
                          console.log('🔄 Removing from claimed set due to error')
                          // Remove from claimed set if failed for other reasons
                          claimedRewardsRef.current.delete(rewardKey)
                          try {
                            localStorage.setItem('claimedRewards', JSON.stringify(Array.from(claimedRewardsRef.current)))
                          } catch (e) {}
                        }
                      },
                    }
                  )
                }
              } catch (error) {
                console.error('Error processing pending reward:', error)
              }
            }
          }
        }
      } catch (error) {
        console.error('Error checking for pending rewards:', error)
      }
    }

    // Check immediately and then every 5 seconds (very frequent for immediate updates)
    checkForPendingRewards()
    const interval = setInterval(checkForPendingRewards, 5000)
    
    return () => {
      clearInterval(interval)
    }
  }, [client, account, PACKAGE_ID, signAndExecute])

  // Fetch mentor 42 Intra data
  const fetchMentorIntraData = async (intraLogin: string) => {
    if (!intraLogin || !intraLogin.trim()) {
      console.warn('⚠️ fetchMentorIntraData: No intra login provided')
      setMentorIntraData(null)
      return
    }
    
    try {
      console.log('Fetching 42 Intra data for login:', intraLogin)
      
      // Get user's token from localStorage (if available)
      const userToken = localStorage.getItem('intra_token')
      
      // Use full URL to ensure it works from network access
      // Check if we're in development (localhost or network IP)
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || /^10\.|^192\.168\.|^172\./.test(window.location.hostname)
      const baseUrl = isDev ? '' : window.location.origin
      const url = `${baseUrl}/api/intra/v2/users/${intraLogin}`
      
      console.log('API URL:', url, '| Hostname:', window.location.hostname, '| IsDev:', isDev)
      
      const headers: HeadersInit = {
        'Accept': 'application/json',
      }
      
      // 42 Intra API'si public endpoint'ler için genellikle token gerektirmez
      // Ancak bazı durumlarda rate limiting için token gerekebilir
      // Önce token olmadan deneyelim, 401 alırsak token ile tekrar deneyelim
      let response: Response
      try {
        response = await fetch(url, {
          method: 'GET',
          headers,
          // Add credentials to ensure cookies/headers are sent in network requests
          credentials: 'same-origin',
        })
      } catch (fetchError: any) {
        console.error('Network error fetching 42 Intra data:', fetchError)
        // If fetch fails (network error), try with full URL
        if (url.startsWith('/')) {
          const fullUrl = `${window.location.origin}${url}`
          console.log('Retrying with full URL:', fullUrl)
          response = await fetch(fullUrl, {
            method: 'GET',
            headers,
            credentials: 'same-origin',
          })
        } else {
          throw fetchError
        }
      }

      console.log('Response status (first attempt):', response.status, response.statusText)

      // If 401 and we have a token, try with token
      if (response.status === 401 && userToken) {
        console.log('🔄 401 received, retrying with user token...')
        headers['Authorization'] = `Bearer ${userToken}`
        try {
          response = await fetch(url, {
            method: 'GET',
            headers,
            credentials: 'same-origin',
          })
        } catch (fetchError: any) {
          // If fetch fails, try with full URL
          if (url.startsWith('/')) {
            const fullUrl = `${window.location.origin}${url}`
            console.log('Retrying with full URL and token:', fullUrl)
            response = await fetch(fullUrl, {
              method: 'GET',
              headers,
              credentials: 'same-origin',
            })
          } else {
            throw fetchError
          }
        }
        console.log('Response status (with token):', response.status, response.statusText)
      }

      if (response.ok) {
        const data = await response.json()
        console.log('42 Intra data received:', {
          login: data.login,
          displayname: data.displayname,
          projects_count: data.projects_users?.length || 0,
          finished_projects: data.projects_users?.filter((p: any) => p.status === 'finished').length || 0,
        })
        setMentorIntraData(data)
        console.log('mentorIntraData state updated')
      } else {
        let errorData: any = {}
        try {
          const errorText = await response.text()
          errorData = errorText ? JSON.parse(errorText) : {}
          console.error('Failed to fetch 42 Intra data:', response.status, errorText)
        } catch (e) {
          console.error('Failed to fetch 42 Intra data:', response.status)
        }
        
        // If still 401, the endpoint requires authentication
        if (response.status === 401) {
          const isTokenExpired = errorData.message?.includes('expired') || errorData.error === 'Not authorized'
          
          if (isTokenExpired && userToken) {
            console.warn('⚠️ Access token expired. Clearing token and requesting re-authentication.')
            // Clear expired token
            localStorage.removeItem('intra_token')
            localStorage.removeItem('intra_user')
            setIsIntraAuthenticated(false)
            setIntraUser(null)
            
            // Show user-friendly message
            console.warn('Your 42 Intra session has expired. Please log in again to view mentor project information.')
            
            // Optionally show a toast/alert (but don't block the UI)
            // You can add a toast notification here if you have a toast system
          } else {
            console.warn('⚠️ 42 Intra API requires authentication for this endpoint.')
            console.warn('Tip: Please log in with 42 Intra on this device to view mentor project information.')
          }
        }
        
        setMentorIntraData(null)
      }
    } catch (error) {
      console.error('Error fetching mentor Intra data:', error)
      console.warn('This might be a network issue. Make sure the Vite dev server is accessible from this network.')
      setMentorIntraData(null)
    }
  }

  const fetchMentorProfile = async (mentorAddress: string) => {
    if (!client) return null

    // Check cache first
    if (mentorProfiles.has(mentorAddress)) {
      return mentorProfiles.get(mentorAddress)
    }

    try {
      const ownedObjects = await client.getOwnedObjects({
        owner: mentorAddress,
        options: {
          showType: true,
          showContent: true,
        },
      })

      const profileObj = ownedObjects.data.find((obj: any) => 
        obj.data?.type?.includes('::peer_help::StudentProfile')
      )

      if (profileObj && profileObj.data && 'content' in profileObj.data && profileObj.data.content && 'fields' in profileObj.data.content) {
        const fields = profileObj.data.content.fields as any
        const profile = {
          displayName: fields.display_name || '',
          intraLogin: fields.intra_login || '',
          helpsGiven: Number(fields.helps_given || 0),
          helpsReceived: Number(fields.helps_received || 0),
          totalXP: Number(fields.total_xp || 0),
          tier: Number(fields.tier || 0),
          avgFeedback: Number(fields.avg_feedback_score || 0),
          successRatio: Number(fields.success_ratio || 0),
        }
        
        setMentorProfiles(prev => {
          const newMap = new Map(prev)
          newMap.set(mentorAddress, profile)
          return newMap
        })
        
        return profile
      }
      return null
    } catch (error) {
      console.error(`Error fetching mentor profile ${mentorAddress}:`, error)
      return null
    }
  }

  // Fetch offers for a specific request
  const fetchOffersForRequest = async (requestId: string, offerIds: string[]) => {
    if (!client) return

    try {
      const offerObjects = await Promise.all(
        offerIds.map(async (offerId: string) => {
          try {
            const obj = await client.getObject({
              id: offerId,
              options: {
                showContent: true,
                showType: true,
              },
            })

            if (obj.data && 'content' in obj.data && obj.data.content && 'fields' in obj.data.content) {
              const fields = obj.data.content.fields as any
              const mentorAddress = fields.mentor || ''
              
              // Fetch mentor profile
              await fetchMentorProfile(mentorAddress)
              
              return {
                id: offerId,
                request_id: requestId,
                mentor: mentorAddress,
                message: fields.message || '',
                competency_level: Number(fields.competency_level || 0),
                past_helps_on_topic: Number(fields.past_helps_on_topic || 0),
                status: Number(fields.status || 0),
                created_at: new Date(Number(fields.created_at || 0)).toISOString(),
              }
            }
            return null
          } catch (error) {
            console.error(`Error fetching offer ${offerId}:`, error)
            return null
          }
        })
      )

      const validOffers = offerObjects.filter((offer): offer is HelpOffer => offer !== null)
      setOffers(prev => {
        const newMap = new Map(prev)
        newMap.set(requestId, validOffers)
        return newMap
      })
    } catch (error) {
      console.error('Error fetching offers:', error)
    }
  }

  // Open offers modal for a request
  const handleViewOffers = async (request: HelpRequest) => {
    setSelectedRequestForOffers(request)
    
    // Fetch offers if not already fetched
    if (request.offers && request.offers.length > 0 && !offers.has(request.id)) {
      await fetchOffersForRequest(request.id, request.offers)
    }
    
    setShowOffersModal(true)
  }

  const handleOfferHelp = async (request: HelpRequest) => {
    if (!account) {
      alert('Please connect your wallet first!')
      return
    }
    
    // Check if user is trying to offer help on their own request
    if (request.owner.toLowerCase() === account.address.toLowerCase()) {
      alert('You cannot offer help on your own request!')
      return
    }
    
    // Check if request is already matched (status = 1) - can't offer on matched requests
    if (request.status === 1) {
      alert('This request has already been matched. You cannot offer help anymore.')
      return
    }
    
    // Check if user has already made an offer on this request
    if (request.offers && request.offers.length > 0) {
      // Fetch offers to check if current user already made an offer
      if (!offers.has(request.id)) {
        await fetchOffersForRequest(request.id, request.offers)
      }
      
      const requestOffers = offers.get(request.id) || []
      const hasAlreadyOffered = requestOffers.some(
        (offer) => offer.mentor.toLowerCase() === account.address.toLowerCase()
      )
      
      if (hasAlreadyOffered) {
        alert('You have already made an offer on this request!')
        return
      }
    }
    
    setSelectedRequest(request)
    setOfferMessage('')
    setCompetencyLevel(3)
    setShowOfferModal(true)
  }

  const submitOffer = async () => {
    if (!account || !selectedRequest) {
      return
    }

    // Double check: Can't offer help on own request
    if (selectedRequest.owner.toLowerCase() === account.address.toLowerCase()) {
      alert('You cannot offer help on your own request!')
      return
    }

    // Check if user has already made an offer for this request
    try {
      const requestObj = await client.getObject({
        id: selectedRequest.id,
        options: { showContent: true },
      })

      if (requestObj.data && 'content' in requestObj.data && requestObj.data.content && 'fields' in requestObj.data.content) {
        const requestFields = (requestObj.data.content as any).fields
        const mentorAddresses = requestFields?.mentor_addresses || []
        
        const hasAlreadyOffered = mentorAddresses.some((addr: string) => 
          addr.toLowerCase() === account.address.toLowerCase()
        )

        if (hasAlreadyOffered) {
          alert('You have already made an offer for this request!')
          return
        }
      }
    } catch (error) {
      console.error('Error checking existing offers:', error)
      // Continue anyway, smart contract will catch it
    }

    if (!offerMessage.trim()) {
      alert('Please write a message!')
      return
    }

    if (!hasProfile) {
      alert('You must create a profile first!')
      return
    }

    setLoading(true)
    
    try {
      // Get user's profile object ID (same method as fetchUserProfile)
      const ownedObjects = await client.getOwnedObjects({
        owner: account.address,
        options: { 
          showType: true,
          showContent: true, // Need content to verify it's a profile
        },
      })

      // Find StudentProfile object - check for any StudentProfile
      const allProfiles = ownedObjects.data.filter((obj: any) => {
        const type = obj.data?.type || ''
        return type.includes('StudentProfile') && type.includes('peer_help')
      })

      console.log('Found profiles:', allProfiles.map((obj: any) => ({
        type: obj.data?.type,
        objectId: obj.data?.objectId
      })))

      // Try to find profile with exact package ID match first
      const expectedType = `${PACKAGE_ID}::peer_help::StudentProfile`
      let profileObj = allProfiles.find((obj: any) => obj.data?.type === expectedType)

      // If no exact match, use the first StudentProfile found (might be from old contract)
      if (!profileObj && allProfiles.length > 0) {
        profileObj = allProfiles[0]
        console.warn('Using profile from different package:', {
          found: profileObj.data?.type,
          expected: expectedType
        })
      }

      if (!profileObj?.data?.objectId) {
        console.error('Profile not found. Available objects:', ownedObjects.data.map((obj: any) => ({
          type: obj.data?.type,
          objectId: obj.data?.objectId
        })))
        alert('Profile not found! Please create a profile first.')
        setLoading(false)
        return
      }

      const profileId = profileObj.data.objectId
      const profileType = profileObj.data.type

      console.log('Using profile:', {
        profileId,
        profileType,
        expectedType: expectedType
      })

      // Warn if type doesn't match, but still try to use it
      if (profileType !== expectedType) {
        console.warn('Profile type mismatch - using anyway:', {
          expected: expectedType,
          got: profileType,
          note: 'This profile might be from an older contract version. If transaction fails, please create a new profile.'
        })
        // Don't block the transaction, just warn
        // The blockchain will reject it if types don't match
      }

      // Ensure profileId is a valid string
      if (!profileId || typeof profileId !== 'string') {
        alert(`Invalid profile ID: ${profileId}`)
        setLoading(false)
        return
      }

      console.log('Creating offer with:', {
        requestId: selectedRequest.id,
        profileId: profileId,
        profileType: profileType,
        message: offerMessage,
        competency: competencyLevel,
      })

      const tx = new Transaction()
      
      try {
        tx.moveCall({
          target: `${PACKAGE_ID}::peer_help::create_help_offer`,
          arguments: [
            tx.object(selectedRequest.id), // &mut HelpRequest (shared object)
            tx.object(profileId), // &mut StudentProfile (owned object)
            tx.pure.vector('u8', Array.from(new TextEncoder().encode(offerMessage))), // vector<u8>
            tx.pure.u8(competencyLevel), // u8
            tx.object('0x6'), // &Clock (shared object)
          ],
        })
      } catch (txError) {
        console.error('Transaction building error:', txError)
        alert(`Failed to build transaction: ${txError}`)
        setLoading(false)
        return
      }

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            console.log('Offer sent successfully:', result)
            const requestIdToUpdate = selectedRequest.id // Save before clearing
            setShowOfferModal(false)
            setOfferMessage('')
            setSelectedRequest(null)
            
            // Refresh profile data after sending offer
            if (fetchUserProfileRef.current) {
              await fetchUserProfileRef.current()
            }
            
            // Refresh the specific request to update mentor_addresses
            setTimeout(async () => {
              try {
                const updatedRequestObj = await client.getObject({
                  id: requestIdToUpdate,
                  options: {
                    showContent: true,
                    showType: true,
                  },
                })

                if (updatedRequestObj.data && 'content' in updatedRequestObj.data && updatedRequestObj.data.content && 'fields' in updatedRequestObj.data.content) {
                  const fields = updatedRequestObj.data.content.fields as any
                  const updatedRequest: HelpRequest = {
                    id: requestIdToUpdate,
                    owner: fields.requester || '',
                    topic: Number(fields.topic || 0),
                    title: fields.title || '',
                    description: fields.description || '',
                    created_at: new Date(Number(fields.created_at || 0)).toISOString(),
                    status: Number(fields.status || 0),
                    vote_count: Number(fields.difficulty_vote_count || 0),
                    community_difficulty: Number(fields.community_difficulty || 0),
                  }
                  if (fields.offers) {
                    updatedRequest.offers = fields.offers
                  }
                  if (fields.mentor_addresses) {
                    updatedRequest.mentor_addresses = fields.mentor_addresses
                  }

                  // Update the request in the requests array
                  setRequests(prevRequests => 
                    prevRequests.map(req => 
                      req.id === requestIdToUpdate ? updatedRequest : req
                    )
                  )
                }
              } catch (error) {
                console.error('Error refreshing request:', error)
              }
            }, 2000) // Wait 2 seconds for blockchain to update
            
            alert(`Help offer sent successfully!\n\nRequest: ${selectedRequest.title}\nCompetency: ${competencyLevel}/5`)
          },
          onError: (error) => {
            console.error('Error sending offer:', error)
            const errorMsg = error?.message || String(error) || 'Unknown error'
            console.error('Full error object:', error)
            if (errorMsg.includes('insufficient') || errorMsg.includes('balance') || errorMsg.includes('gas')) {
              alert('Insufficient SUI balance. You need at least 0.1 SUI for gas fees. Current balance: 2.93 SUI')
            } else {
              alert(`Failed to send offer: ${errorMsg}\n\nCheck console for details.`)
            }
          },
        }
      )
    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Accept offer function
  const acceptOffer = async (request: HelpRequest, offer: HelpOffer) => {
    if (!account || !client) {
      alert('Please connect your wallet first!')
      return
    }

    if (request.owner.toLowerCase() !== account.address.toLowerCase()) {
      alert('You can only accept offers for your own requests!')
      return
    }

    setLoading(true)
    try {
      // Fetch all offers for this request if not already fetched
      if (request.offers && request.offers.length > 0 && !offers.has(request.id)) {
        await fetchOffersForRequest(request.id, request.offers)
      }
      
      // Get all offers for this request to reject the others
      const requestOffers = offers.get(request.id) || []
      const otherOffers = requestOffers.filter(o => o.id !== offer.id && o.status === 0) // Only reject pending offers
      
      const tx = new Transaction()
      
      // Accept the selected offer
      tx.moveCall({
        target: `${PACKAGE_ID}::peer_help::accept_offer`,
        arguments: [
          tx.object(REGISTRY_ID), // PeerHelpRegistry
          tx.object(request.id), // HelpRequest
          tx.object(offer.id), // HelpOffer
          tx.object('0x6'), // Clock
        ],
      })
      
      // Reject all other pending offers
      for (const otherOffer of otherOffers) {
        tx.moveCall({
          target: `${PACKAGE_ID}::peer_help::reject_offer`,
          arguments: [
            tx.object(otherOffer.id), // HelpOffer
          ],
        })
      }

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            console.log('Offer accepted successfully:', result)
            
            // Fetch mentor and mentee profiles to get their 42 Intra logins
            const mentorProfile = mentorProfiles.get(offer.mentor) || await fetchMentorProfile(offer.mentor)
            
            // Fetch mentee profile (current user)
            let menteeProfile = null
            if (account) {
              const ownedObjects = await client.getOwnedObjects({
                owner: account.address,
                options: {
                  showType: true,
                  showContent: true,
                },
              })
              
              const profileObj = ownedObjects.data.find((obj: any) => 
                obj.data?.type?.includes('::peer_help::StudentProfile')
              )
              
              if (profileObj && profileObj.data && 'content' in profileObj.data && profileObj.data.content && 'fields' in profileObj.data.content) {
                const fields = profileObj.data.content.fields as any
                menteeProfile = {
                  displayName: fields.display_name || '',
                  intraLogin: fields.intra_login || '',
                }
              }
            }
            
            // Generate email addresses
            const mentorEmail = mentorProfile?.intraLogin 
              ? `${mentorProfile.intraLogin}@student.42istanbul.com.tr`
              : null
            const menteeEmail = menteeProfile?.intraLogin 
              ? `${menteeProfile.intraLogin}@student.42istanbul.com.tr`
              : null
            
            // Show success toast with email information
            let emailDetails = ''
            if (mentorEmail && menteeEmail) {
              emailDetails = `Mentor Email: ${mentorEmail}\nYour Email: ${menteeEmail}\n\nYou can now contact each other via email!`
            } else if (mentorEmail) {
              emailDetails = `Mentor Email: ${mentorEmail}\n(Your 42 Intra login not found in profile)`
            } else if (menteeEmail) {
              emailDetails = `Your Email: ${menteeEmail}\n(Mentor's 42 Intra login not found in profile)`
            }
            
            // Show toast to request owner (mentee)
            setToast({
              show: true,
              message: 'Offer accepted! You are now matched!',
              type: 'success',
              details: emailDetails || undefined
            })
            
            // Auto-hide toast after 45 seconds
            setTimeout(() => {
              setToast(null)
            }, 45000)
            
            // Send browser notification to request owner (mentee)
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Offer Accepted!', {
                body: `You are now matched with ${mentorProfile?.displayName || offer.mentor.slice(0, 6) + '...'}. Check your email for contact information.`,
                icon: '/favicon.ico',
                tag: 'offer-accepted-mentee'
              })
            } else if ('Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                  new Notification('Offer Accepted!', {
                    body: `You are now matched with ${mentorProfile?.displayName || offer.mentor.slice(0, 6) + '...'}. Check your email for contact information.`,
                    icon: '/favicon.ico',
                    tag: 'offer-accepted-mentee'
                  })
                }
              })
            }
            
            setShowOffersModal(false)
            // Immediately refresh profile data after accepting offer
            if (fetchUserProfileRef.current) {
              await fetchUserProfileRef.current()
            }
            
            // Data will be refreshed by existing useEffect intervals
          },
          onError: (error) => {
            console.error('Error accepting offer:', error)
            setToast({
              show: true,
              message: 'Failed to accept offer',
              type: 'error',
              details: 'Please try again.'
            })
            setTimeout(() => {
              setToast(null)
            }, 5000)
          },
        }
      )
    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Vote on difficulty of a help request
  const voteDifficulty = async (request: HelpRequest, vote: number) => {
    if (!account || !client) {
      setToast({
        show: true,
        message: 'Please connect your wallet first!',
        type: 'error'
      })
      setTimeout(() => setToast(null), 5000)
      return
    }

    if (request.owner.toLowerCase() === account.address.toLowerCase()) {
      setToast({
        show: true,
        message: 'You cannot vote on your own request!',
        type: 'error'
      })
      setTimeout(() => setToast(null), 5000)
      return
    }

    if (votedRequests.has(request.id)) {
      setToast({
        show: true,
        message: 'You have already voted on this request!',
        type: 'error'
      })
      setTimeout(() => setToast(null), 5000)
      return
    }

    if (vote < 1 || vote > 5) {
      setToast({
        show: true,
        message: 'Vote must be between 1 and 5!',
        type: 'error'
      })
      setTimeout(() => setToast(null), 5000)
      return
    }

    setVotingRequest(request.id)
    setLoading(true)

    try {
      const tx = new Transaction()
      
      tx.moveCall({
        target: `${PACKAGE_ID}::peer_help::vote_difficulty`,
        arguments: [
          tx.object(request.id), // HelpRequest
          tx.pure.u8(vote), // Vote (1-5)
          tx.object('0x6'), // Clock
        ],
      })

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            console.log('Vote submitted successfully:', result)
            
            // Mark as voted
            setVotedRequests(prev => new Set(prev).add(request.id))
            
            setToast({
              show: true,
              message: `Vote submitted! (${vote}/5)`,
              type: 'success',
              details: `Current votes: ${request.vote_count + 1}/2 needed`
            })
            
            setTimeout(() => {
              setToast(null)
            }, 5000)
            
            // Data will be refreshed by existing useEffect intervals
          },
          onError: (error) => {
            console.error('Error voting:', error)
            setToast({
              show: true,
              message: 'Failed to submit vote',
              type: 'error',
              details: 'Please try again.'
            })
            setTimeout(() => setToast(null), 5000)
            setLoading(false)
            setVotingRequest(null)
          }
        }
      )
    } catch (error) {
      console.error('Error creating vote transaction:', error)
      setToast({
        show: true,
        message: 'Failed to create vote transaction',
        type: 'error'
      })
      setTimeout(() => setToast(null), 5000)
      setLoading(false)
      setVotingRequest(null)
    }
  }

  // Close request (mentee confirms completion)
  const handleCloseRequest = (request: HelpRequest) => {
    setSelectedRequestToClose(request)
    setShowCloseRequestModal(true)
  }

  const confirmCloseRequest = async (success: boolean) => {
    if (!account || !client || !selectedRequestToClose) {
      setShowCloseRequestModal(false)
      setSelectedRequestToClose(null)
      return
    }

    setLoading(true)
    setShowCloseRequestModal(false)

    try {
      // Verify current user is the requester (mentee)
      const requestObj = await client.getObject({
        id: selectedRequestToClose.id,
        options: { showContent: true, showOwner: true },
      })
      console.log('aaaa-- - - - - - - - - Fetched request object for closing:', requestObj);
      if (!requestObj.data || !('content' in requestObj.data) || !requestObj.data.content) {
        setToast({
          show: true,
          message: 'Request object not found',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      const requestFields = (requestObj.data.content as any).fields
      
      // Verify requester matches current account
      const requesterAddress = requestFields?.requester
      if (!requesterAddress || requesterAddress.toLowerCase() !== account.address.toLowerCase()) {
        setToast({
          show: true,
          message: 'You are not the owner of this request. Please use the correct wallet.',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      let matchId: string | null = null

      // Extract match_id from request object - Option<ID> can be in different formats
      if (requestFields?.match_id) {
        const matchIdValue: any = requestFields.match_id
        
        // Handle different Option<ID> formats
        if (matchIdValue === null || matchIdValue === undefined) {
          // Option::none()
        } else if (typeof matchIdValue === 'string') {
          // Direct string ID
          matchId = matchIdValue
        } else if (typeof matchIdValue === 'object') {
          // Option::some() wrapped: { Some: "0x..." } or { id: "0x..." } or { value: "0x..." }
          if (matchIdValue.Some) {
            matchId = matchIdValue.Some
          } else if (matchIdValue.id) {
            matchId = matchIdValue.id
          } else if (matchIdValue.value) {
            matchId = matchIdValue.value
          } else {
            // Try to extract from object keys
            const keys = Object.keys(matchIdValue)
            if (keys.length > 0) {
              matchId = matchIdValue[keys[0]]
            }
          }
        }
      }

      // If not found in request, try to get from MatchCreated event
      if (!matchId) {
        console.log('⚠️ Match ID not found in request object, trying MatchCreated event...')
        const matchEvents = await client.queryEvents({
          query: {
            MoveEventType: `${PACKAGE_ID}::peer_help::MatchCreated`,
          },
          order: 'descending',
          limit: 100,
        })

        const match = matchEvents.data.find((event: any) => {
          const parsed = event.parsedJson as any
          const eventRequestId = parsed?.request_id
          const eventMentee = parsed?.mentee
          return eventRequestId === selectedRequestToClose.id && 
                 eventMentee?.toLowerCase() === account.address.toLowerCase()
        })

        if (match) {
          const matchParsed = match.parsedJson as any
          let eventMatchId: any = matchParsed?.match_id
          if (typeof eventMatchId === 'object' && eventMatchId !== null) {
            eventMatchId = eventMatchId.id || eventMatchId.value || eventMatchId.Some || String(eventMatchId)
          }
          matchId = String(eventMatchId)
        }
      }

      if (!matchId) {
        setToast({
          show: true,
          message: 'Match ID not found. This request may not be matched yet.',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      // Normalize matchId to string
      matchId = String(matchId).trim()

      // Validate matchId is a valid Sui address format
      if (!matchId.startsWith('0x') || matchId.length < 10) {
        setToast({
          show: true,
          message: `Invalid match ID format: ${matchId}`,
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      console.log('🔍 Match ID found:', matchId)
      console.log('🔍 Current account:', account.address)
      console.log('🔍 Request owner:', requesterAddress)

      // Get mentee profile (current user) - must be from current package
      const expectedProfileType = `${PACKAGE_ID}::peer_help::StudentProfile`
      const menteeObjects = await client.getOwnedObjects({
        owner: account.address,
        options: { showType: true, showContent: true, showOwner: true },
      })
      const menteeProfileObj = menteeObjects.data.find((obj: any) => 
        obj.data?.type === expectedProfileType
      )

      if (!menteeProfileObj || !menteeProfileObj.data || !menteeProfileObj.data.objectId) {
        setToast({
          show: true,
          message: 'Your profile not found or invalid',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      // Verify profile ownership
      const menteeProfileId = menteeProfileObj.data.objectId
      const profileType = menteeProfileObj.data.type
      const profileOwner = menteeProfileObj.data.owner
      const profileContent = menteeProfileObj.data.content
      const profileFields = (profileContent && 'fields' in profileContent) ? (profileContent as any).fields : null
      const profileOwnerField = profileFields?.owner

      console.log('Mentee profile details:', {
        profileId: menteeProfileId,
        profileType: profileType,
        expectedType: expectedProfileType,
        profileOwner: profileOwner,
        profileOwnerField: profileOwnerField,
        currentAccount: account.address,
        typeMatches: profileType === expectedProfileType
      })

      // Verify profile type matches current package
      if (profileType !== expectedProfileType) {
        setToast({
          show: true,
          message: `Profile type mismatch. Expected: ${expectedProfileType}, Got: ${profileType}`,
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      // Verify profile is owned by current account
      const isOwnedByAccount = profileOwner && 
        (typeof profileOwner === 'string' 
          ? profileOwner.toLowerCase() === account.address.toLowerCase()
          : (profileOwner as any).AddressOwner?.toLowerCase() === account.address.toLowerCase())

      if (!isOwnedByAccount) {
        setToast({
          show: true,
          message: 'Profile ownership mismatch. Please use the correct wallet.',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      // Also verify owner field in profile content matches
      if (profileOwnerField && profileOwnerField.toLowerCase() !== account.address.toLowerCase()) {
        setToast({
          show: true,
          message: 'Profile owner field mismatch. Please use the correct wallet.',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      // Get match record to verify it exists and belongs to current user
      const matchRecordObj = await client.getObject({
        id: matchId,
        options: { showContent: true, showOwner: true },
      })

      if (!matchRecordObj.data) {
        setToast({
          show: true,
          message: 'Match record not found',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      // Verify match record belongs to current user (mentee)
      const matchFields = (matchRecordObj.data.content as any).fields
      const matchMentee = matchFields?.mentee
      const matchRequestId = matchFields?.request_id

      console.log('Match record details:', {
        matchMentee,
        currentAccount: account.address,
        matchRequestId,
        requestId: selectedRequestToClose.id
      })

      if (!matchMentee || matchMentee.toLowerCase() !== account.address.toLowerCase()) {
        setToast({
          show: true,
          message: 'You are not the mentee in this match. Please use the correct wallet.',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      if (matchRequestId !== selectedRequestToClose.id) {
        setToast({
          show: true,
          message: 'Match record does not match this request',
          type: 'error'
        })
        setTimeout(() => setToast(null), 5000)
        setLoading(false)
        return
      }

      const tx = new Transaction()

      if (success) {
        // YES - Success: mentor gets XP and rewards (will be updated via event)
        console.log('📝 Creating success transaction with:', {
          registry: REGISTRY_ID,
          matchId,
          requestId: selectedRequestToClose.id,
          menteeProfile: menteeProfileId
        })

        tx.moveCall({
          target: `${PACKAGE_ID}::peer_help::mentee_confirm_completion`,
          arguments: [
            tx.object(REGISTRY_ID), // PeerHelpRegistry (shared)
            tx.object(matchId), // MatchRecord (shared)
            tx.object(selectedRequestToClose.id), // HelpRequest (shared)
            tx.object(menteeProfileId), // Mentee StudentProfile (owned)
            tx.object('0x6'), // Clock (shared object, but passed as object)
          ],
        })
      } else {
        // NO - Failed: mentor gets nothing, request closed as failed
        console.log('Creating failure transaction with:', {
          registry: REGISTRY_ID,
          matchId,
          requestId: selectedRequestToClose.id,
          menteeProfile: menteeProfileId
        })

        tx.moveCall({
          target: `${PACKAGE_ID}::peer_help::mentee_reject_completion`,
          arguments: [
            tx.object(REGISTRY_ID), // PeerHelpRegistry (shared)
            tx.object(matchId), // MatchRecord (shared)
            tx.object(selectedRequestToClose.id), // HelpRequest (shared)
            tx.object(menteeProfileId), // Mentee StudentProfile (owned)
            tx.object('0x6'), // Clock (shared object, but passed as object)
          ],
        })
      }

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            console.log('Request closed:', result)
            
            if (success) {
              setToast({
                show: true,
                message: 'Request closed successfully!',
                type: 'success',
                details: `Mentor earned ${selectedRequestToClose.community_difficulty * 10} XP based on difficulty level (${selectedRequestToClose.community_difficulty}/5)`
              })
            } else {
              setToast({
                show: true,
                message: 'Request closed as failed. Mentor did not receive any rewards.',
                type: 'error'
              })
            }
            
            setTimeout(() => {
              setToast(null)
            }, 10000)
            
            // Refresh profile to show updated data
            if (fetchUserProfileRef.current) {
              // Refresh immediately and then again after a delay
              await fetchUserProfileRef.current()
              setTimeout(() => {
                fetchUserProfileRef.current?.()
              }, 3000)
            }
            
            setSelectedRequestToClose(null)
            
            // Refresh my requests to update status
            // Data will be refreshed by existing useEffect intervals
          },
          onError: (error) => {
            console.error('Error closing request:', error)
            console.error('Error details:', JSON.stringify(error, null, 2))
            setToast({
              show: true,
              message: 'Failed to close request',
              type: 'error',
              details: error?.message || 'Please check the console for details.'
            })
            setTimeout(() => setToast(null), 5000)
            setLoading(false)
          },
          onSettled: () => {
            setLoading(false)
          }
        }
      )
    } catch (error) {
      console.error('Error creating close request transaction:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      setToast({
        show: true,
        message: 'Failed to create transaction',
        type: 'error',
        details: error instanceof Error ? error.message : 'Please check the console for details.'
      })
      setTimeout(() => setToast(null), 5000)
      setLoading(false)
    }
  }

  const createHelpRequest = async () => {
    if (!account) {
      alert('Please connect your wallet first!')
      return
    }

    if (!hasProfile) {
      alert('You must create a profile first! Please go to "My Profile" tab and create your profile.')
      setActiveTab('profile')
      return
    }

    if (!formData.title || !formData.description) {
      alert('Please fill in all fields!')
      return
    }

    setLoading(true)
    try {
      const tx = new Transaction()
      
      tx.moveCall({
        target: `${PACKAGE_ID}::peer_help::create_help_request`,
        arguments: [
          tx.object(REGISTRY_ID), // PeerHelpRegistry
          tx.pure.u8(formData.topic),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(formData.title))),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(formData.description))),
          tx.pure.u8(3), // initial_difficulty (default: 3)
          tx.object('0x6'), // Clock object
        ],
      })

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            console.log('Success:', result)
            alert('Help request created successfully!')
            setFormData({ topic: 0, title: '', description: '' })
            setActiveTab('requests')
            
            // Immediately refresh registry stats
            if (client) {
              try {
                const registryObject = await client.getObject({
                  id: REGISTRY_ID,
                  options: { showContent: true },
                })
                if (registryObject.data && 'content' in registryObject.data && registryObject.data.content && 'fields' in registryObject.data.content) {
                  const fields = registryObject.data.content.fields as any
                  setRegistryStats(prev => ({
                    totalRequests: Number(fields.total_requests || 0),
                    totalMatches: Number(fields.total_matches || 0),
                    totalCompletions: Number(fields.total_completions || 0),
                    activeMentors: Math.floor(Number(fields.total_matches || 0) * 0.7),
                    activeRequests: prev.activeRequests, // Keep existing value
                  }))
                }
              } catch (error) {
                console.error('Error refreshing stats:', error)
              }
            }
          },
          onError: (error) => {
            console.error('Error:', error)
            const errorMsg = error?.message || String(error) || 'Unknown error'
            if (errorMsg.includes('insufficient') || errorMsg.includes('balance')) {
              alert('Insufficient SUI balance. You need at least 0.1 SUI for gas fees.')
            } else {
              alert(`Failed to create help request: ${errorMsg}`)
            }
          },
        }
      )
    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Show auth gate if not authenticated (only if INTRA_CLIENT_ID is set)
  if (INTRA_CLIENT_ID && !isIntraAuthenticated) {
  return (
      <div className="app">
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          background: 'var(--bg-primary)',
        }}>
          <div className="modal" style={{ maxWidth: '500px', margin: '2rem' }}>
            <div className="modal-header">
              <h2>🔐 42 Intra Authentication Required</h2>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>
                This platform is exclusively for 42 students. Please authenticate with your 42 Intra account to continue.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button 
                  className="submit-btn"
                  onClick={handleIntraLogin}
                  style={{ width: '100%' }}
                >
                  <span></span>
                  Login with 42 Intra
                </button>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  You need a valid 42 Intra account to access this platform.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* 42 Intra User Info in Header */}
      {isIntraAuthenticated && intraUser && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          background: 'var(--bg-secondary)',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <span className="user-avatar-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="8" r="4" fill="#9ca3af"/>
              <path d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6" fill="#9ca3af"/>
            </svg>
          </span>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              {intraUser.first_name} {intraUser.last_name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              @{intraUser.login}
            </div>
          </div>
          <button
            onClick={handleIntraLogout}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '0.25rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            Logout
          </button>
        </div>
      )}

      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">🎓</span>
            <span className="logo-text">Suilotion</span>
            <span className="logo-badge">42</span>
          </div>
          <div className="header-right">
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main">
        {/* Hero Section */}
        <section className="hero">
          <h1 className="hero-title">
            Peer-to-Peer Help for
            <span className="gradient-text"> 42 Students</span>
          </h1>
          <p className="hero-subtitle">
            Get help from peers, build your on-chain reputation.
            All transparent, all on Sui blockchain.
          </p>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-value">{registryStats.activeRequests}</span>
              <span className="stat-label">Active Requests</span>
            </div>
            <div className="stat">
              <span className="stat-value">{registryStats.totalCompletions}</span>
              <span className="stat-label">Completed</span>
            </div>
            <div className="stat">
              <span className="stat-value">{registryStats.activeMentors}</span>
              <span className="stat-label">Active Mentors</span>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <nav className="tabs">
          <button 
            className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('requests')}
          >
            <span></span> Help Requests
          </button>
          <button 
            className={`tab ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            <span></span> Create Request
          </button>
          <button 
            className={`tab ${activeTab === 'my-requests' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-requests')}
          >
            <span></span> My Requests
          </button>
          <button 
            className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <span className="profile-avatar-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="8" r="4" fill="#9ca3af"/>
                <path d="M6 20c0-3.314 2.686-6 6-6s6 2.686 6 6" fill="#9ca3af"/>
              </svg>
            </span> My Profile
          </button>
        </nav>

        {/* Tab Content */}
        <div className="content">
          {activeTab === 'requests' && (
            <div className="requests-container animate-fade-in">
              <div className="section-header">
                <h2>Active Help Requests</h2>
              </div>
              
              {loading && requests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                  <p>Loading help requests from blockchain...</p>
                </div>
              ) : requests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <p style={{ marginBottom: '1rem' }}>No help requests found.</p>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Create one!
                  </p>
                </div>
              ) : (
              <div className="requests-grid">
                {requests.map((request, index) => {
                  const topic = TOPICS[request.topic]
                  return (
                    <div 
                      key={request.id} 
                      className="request-card"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="card-header">
                        <div 
                          className="topic-badge"
                          style={{ backgroundColor: topic?.color + '20', color: topic?.color }}
                        >
                          <span>{topic?.icon}</span>
                          {topic?.name}
                        </div>
                      </div>
                      
                      <h3 className="card-title">{request.title}</h3>
                      <p className="card-description">{request.description}</p>
                      
                      {/* Voting Section - Only show if user hasn't voted yet */}
                      {account && 
                       request.owner.toLowerCase() !== account.address.toLowerCase() && 
                       !votedRequests.has(request.id) && (
                        <div style={{
                          marginTop: '1rem',
                          padding: '1rem',
                          background: 'var(--bg-secondary)',
                          borderRadius: '0.5rem',
                          border: '1px solid var(--border)'
                        }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.75rem'
                          }}>
                            <div>
                              <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                                📊 Vote on Difficulty
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {request.vote_count}/2 votes • Avg: {request.community_difficulty}/5
                              </div>
                            </div>
                          </div>
                          
                          <div style={{
                            display: 'flex',
                            gap: '0.5rem',
                            flexWrap: 'wrap'
                          }}>
                            {[1, 2, 3, 4, 5].map((vote) => (
                              <button
                                key={vote}
                                onClick={() => voteDifficulty(request, vote)}
                                disabled={loading || votingRequest === request.id}
                                style={{
                                  flex: 1,
                                  minWidth: '50px',
                                  padding: '0.5rem',
                                  background: votingRequest === request.id ? 'var(--bg-tertiary)' : 'var(--accent)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '0.375rem',
                                  cursor: loading || votingRequest === request.id ? 'not-allowed' : 'pointer',
                                  opacity: loading || votingRequest === request.id ? 0.6 : 1,
                                  fontSize: '0.875rem',
                                  fontWeight: 600,
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  if (!loading && votingRequest !== request.id) {
                                    e.currentTarget.style.transform = 'scale(1.05)'
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'scale(1)'
                                  e.currentTarget.style.boxShadow = 'none'
                                }}
                              >
                                {vote}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="card-footer">
                        <div className="card-meta">
                          <span className="owner">{request.owner.slice(0, 6)}...{request.owner.slice(-4)}</span>
                          <span className="time">
                            {new Date(request.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {account && request.owner.toLowerCase() === account.address.toLowerCase() ? (
                          <button 
                            className="offer-btn"
                            onClick={() => handleViewOffers(request)}
                            style={{ background: 'var(--accent)', color: 'white' }}
                            title="View offers for your request"
                          >
                            📋 See Offers {request.offers && request.offers.length > 0 ? `(${request.offers.length})` : ''}
                          </button>
                        ) : (() => {
                          // Check if user has already made an offer
                          const requestOffers = offers.get(request.id) || []
                          // Check if user has already made an offer
                          const hasAlreadyOffered = account ? (
                            // Check in offers list
                            requestOffers.some(
                              (offer) => offer.mentor.toLowerCase() === account.address.toLowerCase()
                            ) ||
                            // Check in mentor_addresses field (more reliable)
                            (request.mentor_addresses && request.mentor_addresses.some(
                              (addr: string) => addr.toLowerCase() === account.address.toLowerCase()
                            ))
                          ) : false
                          
                          return (
                            <button 
                              className="offer-btn"
                              onClick={() => handleOfferHelp(request)}
                              disabled={hasAlreadyOffered}
                              style={hasAlreadyOffered ? { 
                                opacity: 0.6, 
                                cursor: 'not-allowed',
                                background: 'var(--bg-tertiary)',
                                color: 'var(--text-muted)'
                              } : {}}
                            >
                              {hasAlreadyOffered ? '✓ Offer Sent' : 'Offer Help'}
                            </button>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          )}

          {activeTab === 'create' && (
            <div className="create-container animate-fade-in">
              <div className="form-card">
                <h2>Create Help Request</h2>
                <p className="form-subtitle">Describe your problem and get help from the community</p>
                
                <div className="form-group">
                  <label>Select Topic</label>
                  <div className="topics-grid">
                    {TOPICS.map((topic) => (
                      <button
                        key={topic.id}
                        className={`topic-btn ${formData.topic === topic.id ? 'selected' : ''}`}
                        onClick={() => setFormData({ ...formData, topic: topic.id })}
                        style={{ 
                          borderColor: formData.topic === topic.id ? topic.color : 'transparent',
                          backgroundColor: formData.topic === topic.id ? topic.color + '15' : ''
                        }}
                      >
                        <span className="topic-icon">{topic.icon}</span>
                        <span className="topic-name">{topic.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="title">Title</label>
                  <input
                    type="text"
                    id="title"
                    placeholder="Brief description of your problem..."
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    rows={5}
                    placeholder="Explain your problem in detail. What have you tried? Where are you stuck?"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <button 
                  className="submit-btn"
                  onClick={createHelpRequest}
                  disabled={loading || !account || !hasProfile}
                >
                  {loading ? (
                    <>
                      <span className="spinner"></span>
                      Creating...
                    </>
                  ) : !account ? (
                    'Connect Wallet to Create'
                  ) : !hasProfile ? (
                    'Create Profile First'
                  ) : (
                    <>
                      <span></span>
                      Create Help Request
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'my-requests' && (
            <div className="requests-container animate-fade-in">
              <div className="section-header">
                <h2>My Help Requests</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  View and manage your help requests and offers
                </p>
              </div>
              
              {!account ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <p>Please connect your wallet to view your requests.</p>
                  <ConnectButton style={{ marginTop: '1rem' }} />
                </div>
              ) : loading && myRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                  <p>Loading your requests...</p>
                </div>
              ) : myRequests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                  <p style={{ marginBottom: '1rem' }}>You haven't created any help requests yet.</p>
                  <button 
                    className="submit-btn"
                    onClick={() => setActiveTab('create')}
                    style={{ marginTop: '1rem' }}
                  >
                    <span></span>
                    Create Your First Request
                  </button>
                </div>
              ) : (
                <div className="requests-grid">
                  {myRequests.map((request, index) => {
                    const topic = TOPICS[request.topic]
                    const requestOffers = offers.get(request.id) || []
                    const pendingOffers = requestOffers.filter(o => o.status === 0).length
                    
                    return (
                      <div 
                        key={request.id} 
                        className="request-card"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <div className="card-header">
                          <div 
                            className="topic-badge"
                            style={{ backgroundColor: topic?.color + '20', color: topic?.color }}
                          >
                            <span>{topic?.icon}</span>
                            {topic?.name}
                          </div>
                          <div style={{ 
                            fontSize: '0.75rem', 
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            {request.status === 0 && (
                              <span style={{ 
                                background: '#22c55e20', 
                                color: '#22c55e',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem'
                              }}>
                                Open
                              </span>
                            )}
                            {request.status === 1 && (
                              <span style={{ 
                                background: '#3b82f620', 
                                color: '#3b82f6',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem'
                              }}>
                                Matched
                              </span>
                            )}
                            {request.status === 2 && (
                              <span style={{ 
                                background: '#16a34a20', 
                                color: '#16a34a',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem'
                              }}>
                                Completed
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <h3 className="card-title">{request.title}</h3>
                        <p className="card-description">{request.description}</p>
                        
                        <div className="card-footer">
                          <div className="card-meta">
                            <span className="time">
                              {new Date(request.created_at).toLocaleDateString()}
                            </span>
                            {pendingOffers > 0 && (
                              <span style={{ 
                                color: 'var(--accent)',
                                fontWeight: 600,
                                fontSize: '0.875rem'
                              }}>
                                {pendingOffers} new offer{pendingOffers > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {request.status === 1 ? (
                            // Matched request - show close button
                            <button 
                              className="offer-btn"
                              onClick={() => handleCloseRequest(request)}
                              style={{ 
                                background: '#22c55e', 
                                color: 'white',
                                width: '100%'
                              }}
                            >
                              Close Request
                            </button>
                          ) : (
                            // Open request - show view offers button
                            <button 
                              className="offer-btn"
                              onClick={() => handleViewOffers(request)}
                              disabled={!request.offers || request.offers.length === 0}
                            >
                              {request.offers && request.offers.length > 0 ? (
                                <>View Offers ({request.offers.length})</>
                              ) : (
                                <>No Offers Yet</>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* My Offers Section */}
              <div style={{ marginTop: '3rem' }}>
                <div className="section-header">
                  <h2>My Help Offers</h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    View the status of help offers you've made
                  </p>
                </div>

                {loading && myOffers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                    <p>Loading your offers...</p>
                  </div>
                ) : myOffers.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <p style={{ marginBottom: '1rem' }}>You haven't made any help offers yet.</p>
                    <button 
                      className="submit-btn"
                      onClick={() => setActiveTab('requests')}
                      style={{ marginTop: '1rem' }}
                    >
                      <span>🔍</span>
                      Browse Help Requests
                    </button>
                  </div>
                ) : (
                  <div className="requests-grid">
                    {myOffers.map((offer: any, index) => {
                      const requestTopic = requests.find(r => r.id === offer.request_id)?.topic ?? 0
                      const topic = TOPICS[requestTopic]
                      
                      return (
                        <div 
                          key={offer.id} 
                          className="request-card"
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <div className="card-header">
                            <div 
                              className="topic-badge"
                              style={{ backgroundColor: topic?.color + '20', color: topic?.color }}
                            >
                              <span>{topic?.icon}</span>
                              {topic?.name}
                            </div>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem'
                            }}>
                              {offer.match_status === 'completed' ? (
                                <span style={{ 
                                  background: '#22c55e20', 
                                  color: '#22c55e',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 600
                                }}>
                                  <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }}>
                                      <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </span> Completed
                                </span>
                              ) : offer.match_status === 'matched' ? (
                                <span style={{ 
                                  background: '#3b82f620', 
                                  color: '#3b82f6',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 600
                                }}>
                                  <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }}>
                                      <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </span> Matched
                                </span>
                              ) : offer.status === 1 ? (
                                <span style={{ 
                                  background: '#22c55e20', 
                                  color: '#22c55e',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem'
                                }}>
                                  Accepted
                                </span>
                              ) : offer.status === 2 ? (
                                <span style={{ 
                                  background: '#ef444420', 
                                  color: '#ef4444',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem'
                                }}>
                                  Rejected
                                </span>
                              ) : (
                                <span style={{ 
                                  background: '#f59e0b20', 
                                  color: '#f59e0b',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem'
                                }}>
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <h3 className="card-title">{offer.request_title || 'Unknown Request'}</h3>
                          <p className="card-description">{offer.message || 'No message provided'}</p>
                          
                          <div className="card-footer">
                            <div className="card-meta">
                              <span className="time">
                                {new Date(offer.created_at).toLocaleDateString()}
                              </span>
                              <span style={{ 
                                fontSize: '0.75rem', 
                                color: 'var(--text-muted)'
                              }}>
                                Competency: {offer.competency_level}/5
                              </span>
                            </div>
                            {offer.match_status === 'matched' && (
                              <div style={{ 
                                padding: '0.5rem',
                                background: 'var(--bg-secondary)',
                                borderRadius: '0.375rem',
                                fontSize: '0.875rem',
                                color: 'var(--accent)',
                                fontWeight: 600
                              }}>
                                🎉 You're matched! Check your email for contact info.
                              </div>
                            )}
                            {offer.match_status === 'completed' && (
                              <div style={{ 
                                padding: '0.5rem',
                                background: '#22c55e20',
                                borderRadius: '0.375rem',
                                fontSize: '0.875rem',
                                color: '#22c55e',
                                fontWeight: 600
                              }}>
                                <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }}>
                                    <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </span> Completed! Great job helping out!
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="profile-container animate-fade-in">
              {!account ? (
                <div className="connect-prompt">
                  <span className="prompt-icon">🔐</span>
                  <h2>Connect Your Wallet</h2>
                  <p>Connect your Sui wallet to view your profile and track your progress.</p>
                  <ConnectButton />
                </div>
              ) : !isIntraAuthenticated ? (
                <div className="connect-prompt">
                  <span className="prompt-icon">🎓</span>
                  <h2>42 Intra Authentication Required</h2>
                  <p>You must login with 42 Intra to create or view your profile.</p>
                  <button 
                    className="submit-btn"
                    onClick={handleIntraLogin}
                    style={{ marginTop: '1rem' }}
                  >
                    <span>🎓</span>
                    Login with 42 Intra
                  </button>
                </div>
              ) : hasProfile ? (
                <div className="profile-card">
                  <div className="profile-header">
                    <div className="avatar" style={{ 
                      backgroundImage: intraUser?.image ? `url(${intraUser.image})` : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}>
                      {!intraUser?.image && <span>🎓</span>}
                    </div>
                    <div className="profile-info">
                      <h2>{intraUser?.displayname || profileStats.displayName || '42 Student'}</h2>
                      {intraUser?.login && (
                        <p className="intra-login" style={{ 
                          fontSize: '0.875rem', 
                          color: 'var(--text-muted)',
                          marginTop: '0.25rem',
                          marginBottom: '0.5rem'
                        }}>
                          @{intraUser.login}
                        </p>
                      )}
                      {intraUser?.location && (
                        <p style={{ 
                          fontSize: '0.75rem', 
                          color: 'var(--text-muted)',
                          marginBottom: '0.5rem'
                        }}>
                          📍 {intraUser.location}
                        </p>
                      )}
                      <p className="wallet-address">
                        {account.address.slice(0, 10)}...{account.address.slice(-8)}
                      </p>
                      
                      {/* 42 Intra Stats */}
                      {intraUser && (
                        <div style={{ 
                          display: 'flex', 
                          gap: '1rem', 
                          marginTop: '1rem',
                          padding: '0.75rem',
                          background: 'var(--bg-secondary)',
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem'
                        }}>
                          {intraUser.correction_point !== undefined && (
      <div>
                              <span style={{ color: 'var(--text-muted)' }}>Correction Points:</span>
                              <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>{intraUser.correction_point}</span>
      </div>
                          )}
                          {intraUser.wallet !== undefined && (
                            <div>
                              <span style={{ color: 'var(--text-muted)' }}>Wallet:</span>
                              <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>{intraUser.wallet}</span>
                            </div>
                          )}
                          {intraUser.cursus_users && intraUser.cursus_users.length > 0 && (
                            <div>
                              <span style={{ color: 'var(--text-muted)' }}>Level:</span>
                              <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>
                                {Math.floor(intraUser.cursus_users[0]?.level || 0)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* 42 Intra Projects Section */}
                  {intraUser?.projects_users && intraUser.projects_users.length > 0 && (
                    <div style={{ 
                      marginTop: '2rem',
                      marginBottom: '3rem',
                      padding: '1rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '0.5rem'
                    }}>
                      <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>42 Projects</h3>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '1.25rem'
                      }}>
                        {intraUser.projects_users
                          .filter((p: any) => p.status === 'finished' || p.status === 'in_progress')
                          .slice(0, 12)
                          .map((project: any, index: number) => (
                            <div 
                              key={index}
                              style={{
                                padding: '1rem',
                                background: project.status === 'finished' ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                                borderRadius: '0.5rem',
                                border: `1px solid ${project.status === 'finished' ? '#22c55e' : 'var(--border)'}`,
                                fontSize: '0.875rem'
                              }}
                            >
                              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                {project.project?.name || 'Unknown Project'}
                              </div>
                              <div style={{ 
                                fontSize: '0.75rem', 
                                color: 'var(--text-muted)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}>
                                <span>
                                  {project.status === 'finished' ? (
                                    <span className="project-checkmark">
                                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    </span>
                                  ) : (
                                    <span className="in-progress-icon">
                                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="11" fill="#4b5563" stroke="#374151" strokeWidth="0.5"/>
                                        <path d="M9 10L12 7L15 10" fill="white" stroke="white" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M9 14L12 11L15 14" fill="white" stroke="white" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    </span>
                                  )} {project.status === 'finished' ? 'Finished' : 'In Progress'}
                                </span>
                                {project.final_mark !== null && (
                                  <span style={{ fontWeight: 600 }}>
                                    {project.final_mark}%
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="profile-stats">
                    <div className="profile-stat">
                      <span className="stat-number">{profileStats.helpsGiven}</span>
                      <span className="stat-text">Helps Given</span>
                    </div>
                    <div className="profile-stat">
                      <span className="stat-number">{profileStats.helpsReceived}</span>
                      <span className="stat-text">Helps Received</span>
                    </div>
                    <div className="profile-stat">
                      <span className="stat-number">{profileStats.totalXP}</span>
                      <span className="stat-text">XP Points</span>
                    </div>
                  </div>

                  <div className="badges-section">
                    <h3>XP Ödülü</h3>
                    <div className="xp-reward-container">
                      <div className="xp-reward-info">
                        <div className="xp-reward-header">
                          <span className="xp-amount">{profileStats.totalXP}</span>
                          <span className="xp-separator">/</span>
                          <span className="xp-target">500 XP</span>
                        </div>
                        <div className="xp-progress-bar">
                          <div 
                            className="xp-progress-fill" 
                            style={{ 
                              width: `${Math.min((profileStats.totalXP / 500) * 100, 100)}%` 
                            }}
                          ></div>
                        </div>
                        <div className="xp-reward-details">
                          {profileStats.totalXP >= 500 ? (
                            <div className="xp-reward-claimed">
                              <span className="reward-icon">🎉</span>
                              <span>50 wallet kazandınız! 🎊</span>
                            </div>
                          ) : (
                            <div className="xp-reward-pending">
                              <span>{500 - profileStats.totalXP} XP kaldı</span>
                              <span className="reward-hint">→ 50 wallet ödülü</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="tier-section">
                    <h3>Current Tier</h3>
                    <div className="tier-progress">
                      <div className="tier-bar">
                        <div className="tier-fill" style={{ 
                          width: `${Math.min((profileStats.helpsGiven / 100) * 100, 100)}%` 
                        }}></div>
                      </div>
                      <div className="tier-labels">
                        <span>{profileStats.tier === 0 ? 'Newcomer' : 'Newcomer'}</span>
                        <span>{profileStats.tier === 1 ? 'Bronze (5)' : 'Bronze (5)'}</span>
                        <span>{profileStats.tier === 2 ? 'Silver (15)' : 'Silver (15)'}</span>
                        <span>{profileStats.tier === 3 ? 'Gold (40)' : 'Gold (40)'}</span>
                        <span>{profileStats.tier === 4 ? 'Diamond (50)' : 'Diamond (50)'}</span>
                      </div>
                      <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        {profileStats.helpsGiven} / {profileStats.tier === 0 ? 5 : profileStats.tier === 1 ? 15 : profileStats.tier === 2 ? 40 : 100} helps to next tier
                      </p>
                    </div>
                    
                    {/* Tier NFTs Section */}
                    {tierNFTs.length > 0 && (
                      <div style={{ marginTop: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>Tier NFTs</h3>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                          gap: '1rem' 
                        }}>
                          {tierNFTs.map((nft) => {
                            const tierIcon = nft.tier === 4 ? '💎' : nft.tier === 3 ? '🥇' : nft.tier === 2 ? '🥈' : '🥉'
                            const tierColor = nft.tier === 4 ? '#b9f2ff' : nft.tier === 3 ? '#ffd700' : nft.tier === 2 ? '#c0c0c0' : '#cd7f32'
                            
                            return (
                              <div
                                key={nft.id}
                                style={{
                                  padding: '1rem',
                                  background: 'var(--bg-secondary)',
                                  borderRadius: '0.5rem',
                                  border: `2px solid ${tierColor}`,
                                  textAlign: 'center'
                                }}
                              >
                                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                                  {tierIcon}
                                </div>
                                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                  {nft.tierName || (nft.tier === 4 ? 'Diamond' : nft.tier === 3 ? 'Gold' : nft.tier === 2 ? 'Silver' : 'Bronze')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {nft.helpsGiven} helps given
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                  {new Date(nft.mintedAt).toLocaleDateString()}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="connect-prompt">
                  {!showProfileForm ? (
                    <>
                      <span className="prompt-icon"></span>
                      <h2>Create Your Profile</h2>
                      <p>You don't have a profile yet. Create one to start helping others!</p>
                      {!isIntraAuthenticated ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem', maxWidth: '300px' }}>
                          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            You must login with 42 Intra to create a profile
                          </p>
                          <button 
                            className="submit-btn"
                            onClick={handleIntraLogin}
                            style={{ width: '100%' }}
                          >
                            <span>🎓</span>
                            Login with 42 Intra
        </button>
                        </div>
                      ) : (
                        <button 
                          className="submit-btn" 
                          style={{ marginTop: '1rem', maxWidth: '300px' }}
                          onClick={() => setShowProfileForm(true)}
                        >
                          <span>✨</span>
                          Create Profile
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="form-card" style={{ maxWidth: '500px', margin: '0 auto' }}>
                      <h2>Create Your Profile</h2>
                      <p className="form-subtitle">Fill in your information to get started</p>
                      
                      {!isIntraAuthenticated ? (
                        <div style={{ 
                          padding: '2rem', 
                          textAlign: 'center',
                          background: 'var(--bg-secondary)',
                          borderRadius: '0.5rem',
                          border: '1px solid var(--border)'
                        }}>
                          <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                            You must login with 42 Intra to create a profile
                          </p>
                          <button 
                            className="submit-btn"
                            onClick={handleIntraLogin}
                            style={{ width: '100%' }}
                          >
                            <span>🎓</span>
                            Login with 42 Intra
                          </button>
      </div>
                      ) : (
                        <>
                          <div className="form-group">
                            <label htmlFor="displayName">Display Name</label>
                            <input
                              type="text"
                              id="displayName"
                              placeholder="Your display name (e.g., eslem)"
                              value={profileFormData.displayName}
                              onChange={(e) => setProfileFormData({ ...profileFormData, displayName: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label htmlFor="intraLogin">42 Intra Login</label>
                            <input
                              type="text"
                              id="intraLogin"
                              placeholder="Your 42 intra login (e.g., hbayram)"
                              value={profileFormData.intraLogin}
                              onChange={(e) => setProfileFormData({ ...profileFormData, intraLogin: e.target.value })}
                              disabled={isIntraAuthenticated && intraUser !== null}
                            />
                            {isIntraAuthenticated && intraUser && (
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '14px', height: '14px', verticalAlign: 'middle' }}>
                                    <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </span> Verified: @{intraUser.login}
                              </p>
                            )}
                          </div>
                        </>
                      )}

                      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                        <button 
                          className="cancel-btn" 
                          onClick={() => {
                            setShowProfileForm(false)
                            setProfileFormData({ displayName: '', intraLogin: '' })
                          }}
                          style={{ flex: 1 }}
                        >
                          Cancel
                        </button>
                        <button 
                          className="submit-btn" 
                          onClick={createProfile}
                          disabled={loading || !isIntraAuthenticated || !profileFormData.displayName.trim() || !profileFormData.intraLogin.trim()}
                          style={{ flex: 1 }}
                        >
                          {loading ? (
                            <>
                              <span className="spinner"></span>
                              Creating...
                            </>
                          ) : !isIntraAuthenticated ? (
                            <>
                              <span></span>
                              Login with 42 Intra First
                            </>
                          ) : (
                            <>
                              <span></span>
                              Create Profile
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* View Offers Modal */}
      {showOffersModal && selectedRequestForOffers && (
        <div className="modal-overlay" onClick={() => setShowOffersModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>Offers for Your Request</h2>
              <button className="modal-close" onClick={() => setShowOffersModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="modal-request-info" style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                <h3>{selectedRequestForOffers.title}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{selectedRequestForOffers.description}</p>
              </div>

              {(() => {
                const requestOffers = offers.get(selectedRequestForOffers.id) || []
                // If request is matched (status = 1), only show accepted offer
                // Otherwise show pending offers
                const isMatched = selectedRequestForOffers.status === 1
                const acceptedOffer = isMatched ? requestOffers.find(o => o.status === 1) : null
                const pendingOffers = isMatched ? [] : requestOffers.filter(o => o.status === 0)
                
                if (isMatched && acceptedOffer) {
                  // Show only accepted offer for matched requests
                  const mentorProfile = mentorProfiles.get(acceptedOffer.mentor)
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ 
                        padding: '1rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '0.5rem',
                        border: '2px solid #22c55e'
                      }}>
                        <div style={{ 
                          fontSize: '0.875rem', 
                          color: '#22c55e',
                          fontWeight: 600,
                          marginBottom: '0.75rem'
                        }}>
                          <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }}>
                              <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span> Matched Offer
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                              <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'var(--accent)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.25rem'
                              }}>
                                
                              </div>
                              <div>
                                <div 
                                  style={{ 
                                    fontWeight: 600, 
                                    fontSize: '1rem',
                                    cursor: 'pointer',
                                    color: 'var(--accent)',
                                    textDecoration: 'underline',
                                    textDecorationColor: 'transparent',
                                    transition: 'text-decoration-color 0.2s'
                                  }}
                                  onClick={async () => {
                                    setSelectedMentorAddress(acceptedOffer.mentor)
                                    setShowMentorProfileModal(true)
                                    setMentorIntraData(null)
                                    const profile = await fetchMentorProfile(acceptedOffer.mentor)
                                    if (profile?.intraLogin) {
                                      fetchMentorIntraData(profile.intraLogin)
                                    }
                                  }}
                                >
                                  {mentorProfile?.displayName || 'Unknown'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  @{mentorProfile?.intraLogin || acceptedOffer.mentor.slice(0, 6) + '...' + acceptedOffer.mentor.slice(-4)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div style={{ 
                          padding: '0.75rem',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '0.375rem',
                          fontSize: '0.875rem',
                          color: 'var(--text-secondary)'
                        }}>
                          {acceptedOffer.message}
                        </div>
                      </div>
                    </div>
                  )
                }
                
                if (requestOffers.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      <p>No offers yet. Share your request to get help!</p>
                    </div>
                  )
                }
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {pendingOffers.length > 0 && (
                      <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                        Pending Offers ({pendingOffers.length})
                      </h3>
                    )}
                    {pendingOffers.map((offer) => {
                      const mentorProfile = mentorProfiles.get(offer.mentor)
                      return (
                        <div 
                          key={offer.id}
                          style={{
                            border: '1px solid var(--border)',
                            borderRadius: '0.5rem',
                            padding: '1rem',
                            background: 'var(--bg-secondary)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <div style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '50%',
                                  background: 'var(--accent)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '1.25rem'
                                }}>
                                  🎓
                                </div>
                                <div>
                                  <div 
                                    style={{ 
                                      fontWeight: 600, 
                                      fontSize: '1rem',
                                      cursor: 'pointer',
                                      color: 'var(--accent)',
                                      textDecoration: 'underline',
                                      textDecorationColor: 'transparent',
                                      transition: 'text-decoration-color 0.2s'
                                    }}
                                    onClick={async () => {
                                      setSelectedMentorAddress(offer.mentor)
                                      setShowMentorProfileModal(true)
                                      setMentorIntraData(null) // Reset for new mentor
                                      
                                      // Always fetch profile to ensure we have latest data
                                      const profile = await fetchMentorProfile(offer.mentor)
                                      
                                      // Fetch 42 Intra data if intra login is available
                                      if (profile?.intraLogin) {
                                        console.log('✓ Mentor intra login found:', profile.intraLogin, 'Fetching 42 Intra data...')
                                        fetchMentorIntraData(profile.intraLogin).then(() => {
                                          console.log('✓ 42 Intra data fetched successfully')
                                        }).catch((error) => {
                                          console.error('❌ Error fetching 42 Intra data:', error)
                                        })
                                      } else {
                                        console.log('⚠️ No intra login for mentor:', offer.mentor)
                                      }
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.textDecorationColor = 'var(--accent)'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.textDecorationColor = 'transparent'
                                    }}
                                  >
                                    {mentorProfile?.displayName || 'Unknown'}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    @{mentorProfile?.intraLogin || offer.mentor.slice(0, 6) + '...' + offer.mentor.slice(-4)}
                                  </div>
                                </div>
                              </div>
                              
                              {mentorProfile && (
                                <div style={{ 
                                  display: 'grid', 
                                  gridTemplateColumns: 'repeat(3, 1fr)', 
                                  gap: '0.5rem',
                                  marginTop: '0.75rem',
                                  padding: '0.75rem',
                                  background: 'var(--bg-tertiary)',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.75rem'
                                }}>
                                  <div>
                                    <div style={{ color: 'var(--text-muted)' }}>Helps Given</div>
                                    <div style={{ fontWeight: 600 }}>{mentorProfile.helpsGiven}</div>
                                  </div>
                                  <div>
                                    <div style={{ color: 'var(--text-muted)' }}>Success Rate</div>
                                    <div style={{ fontWeight: 600 }}>{mentorProfile.successRatio}%</div>
                                  </div>
                                  <div>
                                    <div style={{ color: 'var(--text-muted)' }}>Avg Feedback</div>
                                    <div style={{ fontWeight: 600 }}>{mentorProfile.avgFeedback}/100</div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ 
                                fontSize: '0.75rem', 
                                color: 'var(--text-muted)',
                                marginBottom: '0.25rem'
                              }}>
                                Competency
                              </div>
                              <div style={{ fontWeight: 600 }}>
                                {offer.competency_level}/5
                              </div>
                              {offer.past_helps_on_topic > 0 && (
                                <div style={{ 
                                  fontSize: '0.75rem', 
                                  color: 'var(--text-muted)',
                                  marginTop: '0.25rem'
                                }}>
                                  {offer.past_helps_on_topic} helps on this topic
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div style={{ 
                            padding: '0.75rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '0.375rem',
                            marginBottom: '1rem',
                            fontSize: '0.875rem',
                            color: 'var(--text-secondary)'
                          }}>
                            {offer.message}
                          </div>

                          <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button
                              className="submit-btn"
                              onClick={() => acceptOffer(selectedRequestForOffers, offer)}
                              disabled={loading || selectedRequestForOffers.status !== 0}
                              style={{ flex: 1 }}
                            >
                              {loading ? (
                                <>
                                  <span className="spinner"></span>
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }}>
                                      <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </span>
                                  Accept Offer
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {requestOffers.filter(o => o.status !== 0).length > 0 && (
                      <>
                        <h3 style={{ fontSize: '1rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
                          Other Offers
                        </h3>
                        {requestOffers.filter(o => o.status !== 0).map((offer) => {
                          const mentorProfile = mentorProfiles.get(offer.mentor)
                          return (
                            <div 
                              key={offer.id}
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: '0.5rem',
                                padding: '1rem',
                                background: 'var(--bg-secondary)',
                                opacity: 0.7,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div 
                                    style={{ 
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      color: 'var(--accent)',
                                      textDecoration: 'underline',
                                      textDecorationColor: 'transparent',
                                      transition: 'text-decoration-color 0.2s'
                                    }}
                                    onClick={() => {
                                      setSelectedMentorAddress(offer.mentor)
                                      setShowMentorProfileModal(true)
                                      // Fetch profile if not already cached
                                      if (!mentorProfiles.has(offer.mentor)) {
                                        fetchMentorProfile(offer.mentor)
                                      }
                                      // Fetch 42 Intra data if intra login is available
                                      if (mentorProfile?.intraLogin) {
                                        fetchMentorIntraData(mentorProfile.intraLogin)
                                      }
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.textDecorationColor = 'var(--accent)'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.textDecorationColor = 'transparent'
                                    }}
                                  >
                                    {mentorProfile?.displayName || offer.mentor.slice(0, 6) + '...' + offer.mentor.slice(-4)}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {offer.status === 1 ? (
                                      <>
                                        <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '14px', height: '14px', verticalAlign: 'middle' }}>
                                            <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                          </svg>
                                        </span> Accepted
                                      </>
                                    ) : '❌ Rejected'}
                                  </div>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {new Date(offer.created_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Offer Help Modal */}
      {/* Mentor Profile Modal */}
      {showMentorProfileModal && selectedMentorAddress && (() => {
        const mentorProfile = mentorProfiles.get(selectedMentorAddress)
        
        return (
          <div className="modal-overlay" onClick={() => {
            setShowMentorProfileModal(false)
            setSelectedMentorAddress(null)
            setMentorIntraData(null)
          }}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
              <div className="modal-header">
                <h2>👤 Mentor Profile</h2>
                <button className="modal-close" onClick={() => {
                  setShowMentorProfileModal(false)
                  setSelectedMentorAddress(null)
                  setMentorIntraData(null)
                }}>×</button>
              </div>
              
              <div className="modal-body">
                {mentorProfile ? (
                  <>
                    <div className="profile-card" style={{ marginBottom: '1.5rem' }}>
                      <div className="profile-header">
                        <div className="avatar" style={{ 
                          backgroundImage: mentorIntraData?.image?.link ? `url(${mentorIntraData.image.link})` : 'none',
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}>
                          {!mentorIntraData?.image?.link && <span>🎓</span>}
                        </div>
                        <div className="profile-info">
                          <h2>{mentorIntraData?.displayname || mentorProfile.displayName || 'Unknown'}</h2>
                          {mentorProfile.intraLogin && (
                            <p className="intra-login" style={{ 
                              fontSize: '0.875rem', 
                              color: 'var(--text-muted)',
                              marginTop: '0.25rem',
                              marginBottom: '0.5rem'
                            }}>
                              @{mentorProfile.intraLogin}
                            </p>
                          )}
                          {mentorIntraData?.location && (
                            <p style={{ 
                              fontSize: '0.75rem', 
                              color: 'var(--text-muted)',
                              marginBottom: '0.5rem'
                            }}>
                              📍 {mentorIntraData.location}
                            </p>
                          )}
                          <p className="wallet-address">
                            {selectedMentorAddress.slice(0, 10)}...{selectedMentorAddress.slice(-8)}
                          </p>
                          
                          {/* 42 Intra Stats */}
                          {mentorIntraData && (
                            <div style={{ 
                              display: 'flex', 
                              gap: '1rem', 
                              marginTop: '1rem',
                              padding: '0.75rem',
                              background: 'var(--bg-secondary)',
                              borderRadius: '0.5rem',
                              fontSize: '0.875rem'
                            }}>
                              {mentorIntraData.correction_point !== undefined && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>Correction Points:</span>
                                  <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>{mentorIntraData.correction_point}</span>
                                </div>
                              )}
                              {mentorIntraData.wallet !== undefined && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>Wallet:</span>
                                  <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>{mentorIntraData.wallet}</span>
                                </div>
                              )}
                              {mentorIntraData.cursus_users && mentorIntraData.cursus_users.length > 0 && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)' }}>Level:</span>
                                  <span style={{ fontWeight: 600, marginLeft: '0.5rem' }}>
                                    {Math.floor(mentorIntraData.cursus_users[0]?.level || 0)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="profile-stats">
                        <div className="profile-stat">
                          <span className="stat-icon">🤝</span>
                          <span className="stat-number">{mentorProfile.helpsGiven}</span>
                          <span className="stat-text">Helps Given</span>
                        </div>
                        <div className="profile-stat">
                          <span className="stat-icon">📥</span>
                          <span className="stat-number">{mentorProfile.helpsReceived}</span>
                          <span className="stat-text">Helps Received</span>
                        </div>
                        <div className="profile-stat">
                          <span className="stat-icon">⭐</span>
                          <span className="stat-number">{mentorProfile.totalXP}</span>
                          <span className="stat-text">XP Points</span>
                        </div>
                        <div className="profile-stat">
                          <span className="stat-icon">📊</span>
                          <span className="stat-number">{mentorProfile.successRatio}%</span>
                          <span className="stat-text">Success Rate</span>
                        </div>
                        <div className="profile-stat">
                          <span className="stat-icon">💬</span>
                          <span className="stat-number">{mentorProfile.avgFeedback}/100</span>
                          <span className="stat-text">Avg Feedback</span>
                        </div>
                      </div>
                    </div>

                    {/* 42 Intra Projects Section */}
                    {(() => {
                      const hasProjects = mentorIntraData?.projects_users && mentorIntraData.projects_users.length > 0
                      const filteredProjects = hasProjects 
                        ? mentorIntraData.projects_users.filter((p: any) => p.status === 'finished' || p.status === 'in_progress')
                        : []
                      
                      console.log('🔍 Rendering 42 Projects section:', {
                        hasMentorIntraData: !!mentorIntraData,
                        projectsUsersLength: mentorIntraData?.projects_users?.length || 0,
                        filteredProjectsLength: filteredProjects.length,
                        allProjects: mentorIntraData?.projects_users?.map((p: any) => ({
                          name: p.project?.name,
                          status: p.status,
                          final_mark: p.final_mark
                        })) || []
                      })
                      
                      // Show message if no mentor Intra data (token expired or not logged in)
                      if (!mentorIntraData && mentorProfile?.intraLogin) {
                        const hasToken = !!localStorage.getItem('intra_token')
                        return (
                          <div style={{ 
                            marginTop: '2rem',
                            padding: '1.5rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '0.5rem',
                            border: '1px solid var(--border)'
                          }}>
                            <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem' }}>42 Projects</h3>
                            <div style={{ 
                              padding: '1rem',
                              background: hasToken ? '#f59e0b20' : 'var(--bg-tertiary)',
                              borderRadius: '0.5rem',
                              border: `1px solid ${hasToken ? '#f59e0b' : 'var(--border)'}`
                            }}>
                              <p style={{ 
                                color: hasToken ? '#f59e0b' : 'var(--text-muted)', 
                                marginBottom: '0.5rem',
                                fontWeight: 600
                              }}>
                                {hasToken ? '⚠️' : '🔐'} {hasToken ? 'Session Expired' : 'Authentication Required'}
                              </p>
                              <p style={{ 
                                color: 'var(--text-muted)', 
                                fontSize: '0.875rem',
                                marginBottom: hasToken ? '0.75rem' : 0
                              }}>
                                {hasToken 
                                  ? 'Your 42 Intra session has expired. Please log in again to view mentor project information.'
                                  : 'Please log in with 42 Intra to view mentor project information.'
                                }
                              </p>
                              {hasToken && (
                                <button
                                  onClick={() => {
                                    handleIntraLogin()
                                  }}
                                  style={{
                                    marginTop: '0.5rem',
                                    padding: '0.5rem 1rem',
                                    background: 'var(--accent)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    cursor: 'pointer',
                                    fontSize: '0.875rem',
                                    fontWeight: 600
                                  }}
                                >
                                  🔄 Log In Again
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      }
                      
                      if (!hasProjects) {
                        return null
                      }
                      
                      return (
                        <div style={{ 
                          marginTop: '2rem',
                          padding: '1rem',
                          background: 'var(--bg-secondary)',
                          borderRadius: '0.5rem'
                        }}>
                          <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>42 Projects</h3>
                          {filteredProjects.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                              No finished or in-progress projects found.
                            </p>
                          ) : (
                            <div style={{ 
                              display: 'grid', 
                              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                              gap: '1.25rem'
                            }}>
                              {filteredProjects
                                .slice(0, 12)
                                .map((project: any, index: number) => (
                              <div 
                                key={index}
                                style={{
                                  padding: '1rem',
                                  background: project.status === 'finished' ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                                  borderRadius: '0.5rem',
                                  border: `1px solid ${project.status === 'finished' ? '#22c55e' : 'var(--border)'}`,
                                  fontSize: '0.875rem'
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                  {project.project?.name || 'Unknown Project'}
                                </div>
                                <div style={{ 
                                  fontSize: '0.75rem', 
                                  color: 'var(--text-muted)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center'
                                }}>
                                  <span>
                                    {project.status === 'finished' ? (
                                      <span className="project-checkmark">
                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      </span>
                                    ) : (
                                    <span className="in-progress-icon">
                                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="11" fill="#4b5563" stroke="#374151" strokeWidth="0.5"/>
                                        <path d="M9 10L12 7L15 10" fill="white" stroke="white" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M9 14L12 11L15 14" fill="white" stroke="white" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    </span>
                                  )} {project.status === 'finished' ? 'Finished' : 'In Progress'}
                                  </span>
                                  {project.final_mark !== null && (
                                    <span style={{ fontWeight: 600 }}>
                                      {project.final_mark}%
                                    </span>
                                  )}
                                </div>
                              </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    <p>Loading profile...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {showOfferModal && selectedRequest && (
        <div className="modal-overlay" onClick={() => setShowOfferModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🤝 Offer Help</h2>
              <button className="modal-close" onClick={() => setShowOfferModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="modal-request-info">
                <div 
                  className="topic-badge"
                  style={{ 
                    backgroundColor: TOPICS[selectedRequest.topic]?.color + '20', 
                    color: TOPICS[selectedRequest.topic]?.color 
                  }}
                >
                  <span>{TOPICS[selectedRequest.topic]?.icon}</span>
                  {TOPICS[selectedRequest.topic]?.name}
                </div>
                <h3>{selectedRequest.title}</h3>
                <p>{selectedRequest.description}</p>
              </div>

              <div className="form-group">
                <label>Your Competency Level (1-5)</label>
                <div className="competency-selector">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      className={`competency-btn ${competencyLevel === level ? 'selected' : ''}`}
                      onClick={() => setCompetencyLevel(level)}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <span className="competency-label">
                  {competencyLevel === 1 && '😅 Beginner'}
                  {competencyLevel === 2 && '🙂 Intermediate'}
                  {competencyLevel === 3 && '😊 Good'}
                  {competencyLevel === 4 && '😎 Very Good'}
                  {competencyLevel === 5 && '🧙 Expert'}
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="offerMessage">Your Message</label>
                <textarea
                  id="offerMessage"
                  rows={4}
                  placeholder="Explain how you can help with this topic..."
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowOfferModal(false)}>
                Cancel
              </button>
              <button 
                className="submit-btn" 
                onClick={submitOffer}
                disabled={loading || !offerMessage.trim()}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Sending...
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    Send Offer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Request Modal (Y/N) */}
      {showCloseRequestModal && selectedRequestToClose && (
        <div className="modal-overlay" onClick={() => {
          setShowCloseRequestModal(false)
          setSelectedRequestToClose(null)
        }}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>
                <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '6px' }}>
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '20px', height: '20px', verticalAlign: 'middle' }}>
                    <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span> Close Request
              </h2>
              <button className="modal-close" onClick={() => {
                setShowCloseRequestModal(false)
                setSelectedRequestToClose(null)
              }}>×</button>
            </div>
            
            <div className="modal-body">
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>{selectedRequestToClose.title}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Did the help complete successfully?
                </p>
              </div>

              <div style={{ 
                padding: '1rem',
                background: 'var(--bg-secondary)',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ fontSize: '0.875rem', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Current Difficulty Level: {selectedRequestToClose.community_difficulty}/5
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  Votes: {selectedRequestToClose.vote_count}/2
                </div>
                {selectedRequestToClose.vote_count >= 2 && (
                  <div style={{ 
                    fontSize: '0.875rem', 
                    color: '#22c55e',
                    marginTop: '0.5rem',
                    fontWeight: 600
                  }}>
                    <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }}>
                        <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span> Mentor will earn {selectedRequestToClose.community_difficulty * 10} XP
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                className="cancel-btn" 
                onClick={() => confirmCloseRequest(false)}
                style={{ flex: 1 }}
              >
                ❌ No
              </button>
              <button 
                className="submit-btn" 
                onClick={() => confirmCloseRequest(true)}
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? (
                  <>
                    <span className="spinner"></span>
                    Processing...
                  </>
                ) : (
                  <>
                    <span className="project-checkmark" style={{ display: 'inline-block', marginRight: '4px' }}>
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '16px', height: '16px', verticalAlign: 'middle' }}>
                        <path d="M5 12L10 17L19 6" stroke="#4ade80" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    Yes, Close Request
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && toast.show && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            minWidth: '320px',
            maxWidth: '500px',
            padding: '1rem 1.25rem',
            background: toast.type === 'success' 
              ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
              : toast.type === 'error'
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2), 0 4px 10px rgba(0, 0, 0, 0.1)',
            animation: 'slideInRight 0.3s ease-out',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            cursor: 'pointer',
          }}
          onClick={() => setToast(null)}
        >
          <div style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ 
                fontWeight: 600, 
                fontSize: '1rem',
                marginBottom: toast.details ? '0.5rem' : 0
              }}>
                {toast.message}
              </div>
              {toast.details && (
                <div style={{ 
                  fontSize: '0.875rem', 
                  opacity: 0.9,
                  whiteSpace: 'pre-line',
                  lineHeight: '1.5'
                }}>
                  {toast.details}
                </div>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setToast(null)
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>Built for 42 Kocaeli | Sui Foundation Hackathon</p>
      </footer>
    </div>
  )
}

export default App
