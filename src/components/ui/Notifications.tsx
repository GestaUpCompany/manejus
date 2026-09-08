import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Notification {
  id: string
  tipo: 'info' | 'warning' | 'error' | 'success'
  titulo: string
  mensagem: string
  lida: boolean
  acao_url?: string
  acao_label?: string
  created_at: string
}

export function Notifications() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000) // Polling a cada 30 segundos
    return () => clearInterval(interval)
  }, [user])

  const loadNotifications = async () => {
    if (!user) return

    setLoading(true)

    const fazendaId = await getFazendaIdForUser(user.id)

    if (!fazendaId) {
      setLoading(false)
      return
    }

    // Gerar notificacoes de recategorizacao proxima antes de carregar
    // A RPC faz dedup por lote_categoria_id, entao chamar a cada poll e seguro
    await supabase.rpc('gerar_notificacoes_recategorizacao', {
      p_fazenda_id: fazendaId,
      p_usuario_id: user.id,
    })

    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('usuario_id', user.id)
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Erro ao buscar notificações:', error)
    } else {
      setNotifications(data as Notification[])
      setUnreadCount((data as Notification[]).filter(n => !n.lida).length)
    }

    setLoading(false)
  }

  const markAsRead = async (notificationId: string) => {
    await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', notificationId)

    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, lida: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const markAllAsRead = async () => {
    const unreadNotifications = notifications.filter(n => !n.lida)
    
    await supabase
      .from('notificacoes')
      .update({ lida: true })
      .in('id', unreadNotifications.map(n => n.id))

    setNotifications(prev =>
      prev.map(n => ({ ...n, lida: true }))
    )
    setUnreadCount(0)
  }

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)
    if (notification.acao_url) {
      navigate(notification.acao_url)
      setIsOpen(false)
    }
  }

  const getNotificationIcon = (tipo: string) => {
    switch (tipo) {
      case 'info':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'success':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return null
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Agora'
    if (diffMins < 60) return `${diffMins} min`
    if (diffHours < 24) return `${diffHours} h`
    if (diffDays < 7) return `${diffDays} d`
    return date.toLocaleDateString('pt-BR')
  }

  return (
    <div className="relative" ref={notificationsRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notificações"
        className="relative flex items-center justify-center w-11 h-11 bg-white/10 rounded-lg transition-all text-white"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop para mobile */}
          <div 
            className="fixed inset-0 z-50 sm:hidden"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Notifications Dropdown/Bottom Sheet */}
          <div className="fixed sm:absolute inset-x-4 sm:inset-auto top-4 bottom-4 sm:top-auto sm:bottom-auto right-0 sm:right-4 mt-2 w-[calc(100%-2rem)] sm:w-96 bg-white sm:rounded-lg shadow-xl border border-gray-200 overflow-hidden animate-scale-in z-[60] flex flex-col max-h-[70vh] sm:max-h-96 rounded-2xl">
            <div className="p-3 sm:p-4 border-b border-gray-200 flex items-center gap-3 shrink-0">
              <h3 className="font-semibold text-gray-800 text-base sm:text-lg flex-1">Notificações</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-sm text-primary transition-all shrink-0"
                >
                  Marcar todas como lidas
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Fechar notificações"
                className="p-2 text-gray-400 rounded-lg hover:bg-gray-100 transition-colors sm:hidden shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex justify-center sm:hidden mb-2 pt-2">
              <div className="w-12 h-1 bg-gray-300 rounded-full"></div>
            </div>

            <div className="overflow-y-auto flex-1">
              {loading && (
                <div className="p-4 text-center text-gray-500">
                  <svg className="animate-spin h-6 w-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Carregando...
                </div>
              )}

              {!loading && notifications.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <p className="text-sm sm:text-base">Nenhuma notificação</p>
                </div>
              )}

              {!loading && notifications.length > 0 && (
                <div>
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-3 sm:p-4 border-b border-gray-100 cursor-pointer transition-all min-h-[48px] ${
                        !notification.lida ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.tipo)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm sm:text-base">{notification.titulo}</p>
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">{notification.mensagem}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-400">{formatTime(notification.created_at)}</span>
                            {notification.acao_label && (
                              <span className="text-xs text-primary font-medium">{notification.acao_label}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
