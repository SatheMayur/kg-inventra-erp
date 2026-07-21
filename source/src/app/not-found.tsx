import { Search, Home, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
      <div className="relative mb-8">
        <div className="relative flex size-24 items-center justify-center rounded-3xl bg-sky-500/10 border border-sky-500/20 shadow-2xl shadow-sky-500/10">
          <Search className="size-12 text-sky-500" />
        </div>
      </div>

      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">Resource Not Found</h1>
        <p className="text-muted-foreground/80 leading-relaxed">
          The endpoint or asset you are attempting to access does not exist within the current environment or has been decommissioned.
        </p>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            asChild
            className="w-full sm:w-auto h-12 px-8 rounded-2xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 gap-2"
          >
            <Link href="/">
              <Home className="size-4" />
              Return to Console
            </Link>
          </Button>
          <Button
            variant="outline"
            asChild
            className="w-full sm:w-auto h-12 px-8 rounded-2xl border-border/50 font-bold hover:bg-secondary/50 transition-all gap-2"
          >
            <Link href="/">
              <ArrowLeft className="size-4" />
              Previous View
            </Link>
          </Button>
        </div>
      </div>

      <p className="mt-12 text-[10px] text-muted-foreground/40 uppercase tracking-[0.2em] font-bold">
        Inventra | Error 404
      </p>
    </div>
  )
}
