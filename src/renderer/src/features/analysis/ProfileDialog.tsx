import * as React from 'react'
import { NETWORKS, NETWORK_META, type Network } from '@shared/connectors/networks'
import type { Profile } from '@shared/domain/analysis'
import { Button } from '@renderer/components/ui/button'
import { Field, Input, Textarea } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { useAccounts } from '@renderer/features/accounts/useAccounts'
import { useCreateProfile, useUpdateProfile } from './useAnalysis'

const NO_ACCOUNT = '__none__'

interface ProfileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = cuenta nueva. */
  profile: Profile | null
  onSaved: (profile: Profile) => void
}

/** Alta o edición de una cuenta a analizar: red, usuario y si es propia. */
export function ProfileDialog({
  open,
  onOpenChange,
  profile,
  onSaved
}: ProfileDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* El formulario se monta al abrir, así parte siempre de la cuenta elegida. */}
        <ProfileForm profile={profile} onOpenChange={onOpenChange} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  )
}

function ProfileForm({
  onOpenChange,
  profile,
  onSaved
}: Omit<ProfileDialogProps, 'open'>): React.JSX.Element {
  const accounts = useAccounts()
  const create = useCreateProfile()
  const update = useUpdateProfile()
  const [network, setNetwork] = React.useState<Network>(profile?.network ?? 'instagram')
  const [username, setUsername] = React.useState(profile?.username ?? '')
  const [displayName, setDisplayName] = React.useState(profile?.displayName ?? '')
  const [isOwn, setIsOwn] = React.useState(profile?.isOwn ?? true)
  const [accountId, setAccountId] = React.useState<string | null>(profile?.accountId ?? null)
  const [notes, setNotes] = React.useState(profile?.notes ?? '')

  const instagramAccounts = (accounts.data ?? []).filter((a) => a.network === 'instagram')
  const pending = create.isPending || update.isPending
  const error = create.error ?? update.error

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const values = {
      network,
      username,
      displayName,
      isOwn,
      accountId: network === 'instagram' ? accountId : null,
      notes
    }
    const done = { onSuccess: (saved: Profile) => onSaved(saved) }
    if (profile) update.mutate({ id: profile.id, patch: values }, done)
    else create.mutate(values, done)
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{profile ? 'Editar cuenta' : 'Añadir una cuenta'}</DialogTitle>
        <DialogDescription>
          No hace falta conectarla: basta con la red y el nombre de usuario.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-4">
        <Field label="Red" htmlFor="profile-network">
          <Select value={network} onValueChange={(value) => setNetwork(value as Network)}>
            <SelectTrigger id="profile-network" aria-label="Red">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NETWORKS.map((n) => (
                <SelectItem key={n} value={n}>
                  {NETWORK_META[n].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="Nombre de usuario"
          htmlFor="profile-username"
          hint="Con o sin @. También vale el enlace al perfil."
        >
          <Input
            id="profile-username"
            value={username}
            autoFocus
            required
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Nombre para reconocerla (opcional)" htmlFor="profile-name">
          <Input
            id="profile-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium" id="profile-own-label">
              Es una cuenta mía
            </p>
            <p className="text-xs text-muted">
              Si es de referencia, Claude te dirá qué aprender de ella para la tuya.
            </p>
          </div>
          <Switch checked={isOwn} onCheckedChange={setIsOwn} aria-labelledby="profile-own-label" />
        </div>
        {network === 'instagram' && instagramAccounts.length > 0 && (
          <Field
            label="Cuenta conectada para traer datos (opcional)"
            htmlFor="profile-account"
            hint="Solo tu propia cuenta conectada en Cuentas da métricas automáticas."
          >
            <Select
              value={accountId ?? NO_ACCOUNT}
              onValueChange={(value) => setAccountId(value === NO_ACCOUNT ? null : value)}
            >
              <SelectTrigger id="profile-account" aria-label="Cuenta conectada">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ACCOUNT}>Ninguna (con capturas)</SelectItem>
                {instagramAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    @{a.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Notas (opcional)" htmlFor="profile-notes">
          <Textarea
            id="profile-notes"
            rows={2}
            className="min-h-14"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !username.trim()}>
          {profile ? 'Guardar' : 'Añadir'}
        </Button>
      </DialogFooter>
    </form>
  )
}
