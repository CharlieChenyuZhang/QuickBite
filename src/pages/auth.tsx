import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Leaf, LoaderCircle, LockKeyhole } from 'lucide-react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FoodImage } from '@/components/food-image'
import { api, isDemoMode } from '@/lib/api'
import { useSession } from '@/lib/session'
import { errorMessage, foodImage } from '@/lib/presentation'

function safeRedirect(value: string | null) {
  return value &&
    /^\/(?!\/)/.test(value) &&
    !value.includes('\\') &&
    !/^\/(login|signup)([/?#]|$)/.test(value)
    ? value
    : '/'
}
export function AuthPage({ signup = false }: { signup?: boolean }) {
  const [params] = useSearchParams()
  const redirect = safeRedirect(params.get('redirect'))
  const auth = useSession()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState('')
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const password = String(data.get('password'))
      if (signup) {
        await api.signup({
          email: String(data.get('email')).trim(),
          password,
          first_name: String(data.get('first_name')).trim(),
          last_name: String(data.get('last_name')).trim(),
        })
        toast.success('Your account is ready. Sign in to find your next bite.')
        navigate(`/login?redirect=${encodeURIComponent(redirect)}`, { replace: true })
      } else {
        await auth.signIn({ username: String(data.get('username')).trim(), password })
        toast.success('Welcome back. Let’s find something delicious!')
        navigate(redirect, { replace: true })
      }
    },
    retry: false,
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (signup && data.get('password') !== data.get('confirm_password')) {
      setValidationError('Your passwords don’t match. Please try again.')
      return
    }
    if (
      signup &&
      (!String(data.get('first_name')).trim() || !String(data.get('last_name')).trim())
    ) {
      setValidationError('Please enter your first and last name.')
      return
    }
    setValidationError('')
    mutation.mutate(data)
  }
  if (auth.isAuthenticated) return <Navigate to={redirect} replace />
  const otherLink = `/${signup ? 'login' : 'signup'}?redirect=${encodeURIComponent(redirect)}`
  return (
    <div className="page-content auth-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={16} /> Back to discovering
      </Link>
      <section className="auth-card">
        <div className="auth-form-panel">
          <span className="auth-icon">
            <UtensilMark />
          </span>
          <p className="eyebrow">{signup ? 'GOOD TASTE STARTS HERE' : 'YOUR TABLE IS WAITING'}</p>
          <h1>{signup ? 'A fresh start.' : 'Welcome back.'}</h1>
          <p className="auth-subtitle">
            {signup
              ? 'Create an account. Find your next favorite bite.'
              : 'Sign in for something delicious.'}
          </p>
          {isDemoMode && (
            <div className="demo-notice">
              <Leaf size={16} />
              <p>
                You’re exploring a demo. Use any email and password to try it. No real orders are
                placed.
              </p>
            </div>
          )}
          <form onSubmit={submit} className="auth-form">
            {signup ? (
              <>
                <div className="form-row">
                  <label htmlFor="first_name">
                    First name
                    <Input
                      id="first_name"
                      name="first_name"
                      autoComplete="given-name"
                      required
                      maxLength={80}
                      placeholder="Alex"
                    />
                  </label>
                  <label htmlFor="last_name">
                    Last name
                    <Input
                      id="last_name"
                      name="last_name"
                      autoComplete="family-name"
                      required
                      maxLength={80}
                      placeholder="Morgan"
                    />
                  </label>
                </div>
                <label htmlFor="email">
                  Email
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                  />
                </label>
              </>
            ) : (
              <label htmlFor="username">
                Email or username
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  required
                  placeholder="you@example.com"
                />
              </label>
            )}
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <div className="password-field">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  required
                  minLength={signup ? 8 : undefined}
                  placeholder={signup ? 'At least 8 characters' : 'Enter your password'}
                  aria-describedby={signup ? 'password-help' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {signup && (
              <>
                <p className="field-help" id="password-help">
                  Use at least 8 characters for your password.
                </p>
                <label htmlFor="confirm_password">
                  Confirm password
                  <Input
                    id="confirm_password"
                    name="confirm_password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    placeholder="Enter your password again"
                    aria-invalid={!!validationError}
                    aria-describedby={validationError ? 'auth-error' : undefined}
                  />
                </label>
              </>
            )}
            {(validationError || mutation.isError) && (
              <p role="alert" className="form-error" id="auth-error">
                {validationError || errorMessage(mutation.error)}
              </p>
            )}
            <Button size="lg" type="submit" disabled={mutation.isPending} className="w-full">
              {mutation.isPending ? <LoaderCircle className="animate-spin" size={18} /> : null}
              {signup ? 'Create account' : 'Sign in'}{' '}
              {!mutation.isPending && <ArrowRight size={17} />}
            </Button>
          </form>
          <p className="auth-switch">
            {signup ? 'Already part of the table?' : 'New to QuickBite?'}{' '}
            <Link to={otherLink}>{signup ? 'Sign in' : 'Create an account'}</Link>
          </p>
          <p className="auth-security">
            <LockKeyhole size={13} /> Your cravings are in good hands.
          </p>
        </div>
        <div className="auth-visual">
          <FoodImage
            src={foodImage('photo-1547592180-85f173990554', 1000)}
            alt="Freshly prepared food made with colorful seasonal ingredients"
            eager
          />
          <div />
          <section>
            <span>
              <Leaf size={19} /> A LITTLE FRESHNESS GOES A LONG WAY
            </span>
            <h2>
              Good things
              <br />
              are on
              <br />
              the menu.
            </h2>
            <p>
              Your favorites. Your next discovery.
              <br />
              All just a bite away.
            </p>
          </section>
        </div>
      </section>
    </div>
  )
}
function UtensilMark() {
  return <Leaf size={27} strokeWidth={1.6} />
}
