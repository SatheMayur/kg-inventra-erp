'use client'

import { useEffect } from 'react'
import { ErrorBoundary } from './error-boundary'
import { Toaster } from 'sonner'
import NextTopLoader from 'nextjs-toploader'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  // Aggressively scrub the DOM for any injected watermarks or SDK elements
  useEffect(() => {
    const scrub = () => {
      document.querySelectorAll('div, iframe, img').forEach(el => {
        const outerHTML = el.outerHTML.toLowerCase();
        if (
          outerHTML.includes('z-ai') || 
          outerHTML.includes('chatglm') || 
          outerHTML.includes('watermark') ||
          (el.tagName === 'DIV' && el.innerHTML.toLowerCase().includes('powered by'))
        ) {
          try { el.remove(); } catch (e) {}
        }
      });
    };
    
    // Run immediately and set up an observer for dynamic injections
    scrub();
    const observer = new MutationObserver(scrub);
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => observer.disconnect();
  }, []);

  return (
    <ErrorBoundary>
      <NextTopLoader
        color="#f59e0b"
        height={2}
        showSpinner={false}
        shadow={false}
        easing="ease"
        speed={200}
      />
      {children}
      <Toaster
        position="top-right"
        theme="light"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: '#FFFFFF',
            border: '1px solid #E7E5E4',
            color: '#292524',
          },
        }}
      />
    </ErrorBoundary>
  )
}
