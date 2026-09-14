import { useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRightLeft, LoaderCircle, LogOut, ShoppingBag, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useSession } from '@/lib/session'
import { errorMessage } from '@/lib/presentation'

export function AccountMenu() {
  const { username, signOut, isSigningOut } = useSession()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [action, setAction] = useState<'logout' | 'switch'>('logout')
  const isUpdatingCart = useIsMutating() > 0
  const navigate = useNavigate()

  async function leaveAccount(nextAction: 'logout' | 'switch') {
    if (isSigningOut || isUpdatingCart) return
    setAction(nextAction)
    setError('')
    try {
      await signOut()
      toast.dismiss()
      setOpen(false)
      navigate('/login', { replace: true, state: null })
      toast.success(
        nextAction === 'switch'
          ? 'You can now sign in with another account.'
          : 'You’re logged out.',
      )
    } catch (reason) {
      setError(errorMessage(reason))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSigningOut) return
        setOpen(nextOpen)
        if (nextOpen) setError('')
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" className="account-button" aria-label="My account">
          <UserRound size={19} />
          <span>{username || 'My account'}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!isSigningOut}
        onEscapeKeyDown={(event) => {
          if (isSigningOut) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (isSigningOut) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>Your account</DialogTitle>
          <DialogDescription className="break-all">
            {username ? `Signed in as ${username}.` : 'Your session is active.'}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Your cart is saved to your account. Come back whenever you’re hungry.
        </p>
        <DialogClose asChild>
          <Button asChild variant="secondary" disabled={isSigningOut}>
            <Link
              to="/cart"
              aria-disabled={isSigningOut}
              onClick={(event) => {
                if (isSigningOut) event.preventDefault()
              }}
            >
              <ShoppingBag size={17} /> View your cart
            </Link>
          </Button>
        </DialogClose>
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2" aria-busy={isSigningOut}>
          <Button
            variant="outline"
            disabled={isSigningOut || isUpdatingCart}
            onClick={() => {
              void leaveAccount('switch')
            }}
          >
            {isSigningOut && action === 'switch' ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : (
              <ArrowRightLeft size={17} />
            )}
            {isSigningOut && action === 'switch' ? 'Switching account…' : 'Switch account'}
          </Button>
          <Button
            disabled={isSigningOut || isUpdatingCart}
            onClick={() => {
              void leaveAccount('logout')
            }}
          >
            {isSigningOut && action === 'logout' ? (
              <LoaderCircle size={17} className="animate-spin" />
            ) : (
              <LogOut size={17} />
            )}
            {isSigningOut && action === 'logout' ? 'Logging out…' : 'Log out'}
          </Button>
        </div>
        {isUpdatingCart && (
          <p role="status" className="text-sm text-muted-foreground">
            Your cart is updating. You can log out as soon as it finishes.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
