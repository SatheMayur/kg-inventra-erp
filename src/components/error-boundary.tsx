'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background">
          <Card className="max-w-md w-full border-red-500/20 bg-card/50 backdrop-blur-xl">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto size-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                <AlertTriangle className="size-6 text-red-500" />
              </div>
              <CardTitle className="text-xl">Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                The application encountered an unexpected error. We've logged the details for our team.
              </p>
              <div className="p-3 bg-muted/30 rounded text-[10px] font-mono text-left overflow-auto max-h-32 text-red-400">
                {this.state.error?.message || 'Unknown Error'}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button 
                className="w-full gap-2" 
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="size-4" />
                Reload Application
              </Button>
              <Button 
                variant="ghost" 
                className="w-full gap-2"
                onClick={() => window.location.href = '/'}
              >
                <Home className="size-4" />
                Return to Dashboard
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
