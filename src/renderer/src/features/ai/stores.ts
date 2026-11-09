import { create } from 'zustand'
import type { Network } from '@shared/connectors/networks'
import { ScreenContextSchema, type ScreenContext } from '@shared/domain/ai'
import type { MediaAsset } from '@shared/domain/media'

/** Lo que la pantalla actual cuenta al asistente. Cada página lo actualiza al montarse. */
interface ScreenContextState {
  context: ScreenContext
  setContext: (context: Partial<ScreenContext>) => void
  clearScreen: (screen: ScreenContext['screen']) => void
}

export const useScreenContextStore = create<ScreenContextState>((set) => ({
  context: ScreenContextSchema.parse({}),
  setContext: (partial) =>
    set((state) => ({ context: ScreenContextSchema.parse({ ...state.context, ...partial }) })),
  clearScreen: (screen) =>
    set((state) =>
      state.context.screen === screen
        ? { context: ScreenContextSchema.parse({ pillars: state.context.pillars }) }
        : state
    )
}))

/** Estado del panel lateral del asistente. */
interface AssistantUiState {
  open: boolean
  conversationId: string | null
  setOpen: (open: boolean) => void
  toggle: () => void
  setConversationId: (id: string | null) => void
}

export const useAssistantUi = create<AssistantUiState>((set) => ({
  open: false,
  conversationId: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setConversationId: (conversationId) => set({ conversationId })
}))

/**
 * Puente entre el asistente y el compositor: el asistente deja aquí lo que el
 * usuario quiere aplicar y el compositor (si está montado) lo recoge.
 */
export type ComposerInsert =
  | { kind: 'body'; text: string }
  | { kind: 'variant'; network: Network; text: string }
  | { kind: 'appendBody'; text: string }
  | { kind: 'media'; asset: MediaAsset }

interface ComposerBridgeState {
  pending: ComposerInsert | null
  /** true si hay un compositor montado que atenderá las inserciones. */
  mounted: boolean
  push: (insert: ComposerInsert) => void
  take: () => ComposerInsert | null
  setMounted: (mounted: boolean) => void
}

export const useComposerBridge = create<ComposerBridgeState>((set, get) => ({
  pending: null,
  mounted: false,
  push: (pending) => set({ pending }),
  take: () => {
    const pending = get().pending
    if (pending) set({ pending: null })
    return pending
  },
  setMounted: (mounted) => set({ mounted })
}))
