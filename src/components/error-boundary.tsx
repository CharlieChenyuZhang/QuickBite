import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/feedback'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed)
      return (
        <main className="page-content">
          <EmptyState
            title="Let’s get you back to the good stuff"
            description="Something unexpected interrupted this page. Reload to try again."
            action={<Button onClick={() => window.location.reload()}>Reload QuickBite</Button>}
          />
        </main>
      )
    return this.props.children
  }
}
